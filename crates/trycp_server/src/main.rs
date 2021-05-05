//! trycp_server listens for remote commands issued by tryorama and does as requested
//! with a set of Holochain conductors that it manages on the local machine.

mod save_dna;
mod startup;

use std::{
    collections::HashMap,
    hash::Hash,
    io::{self, Write},
    path::{Path, PathBuf},
    process::Child,
    sync::{
        atomic::{self, AtomicU16},
        Arc,
    },
};

use futures::{future, stream::SplitStream, SinkExt};
use futures_util::StreamExt;
use nix::{
    sys::signal::{self, Signal},
    unistd::Pid,
};
use once_cell::sync::Lazy;
use parking_lot::{Mutex, RwLock, RwLockReadGuard, RwLockWriteGuard};
use serde::{Deserialize, Serialize};
use slab::Slab;
use snafu::{ensure, IntoError, Snafu};
use snafu::{OptionExt, ResultExt};
use structopt::StructOpt;
use tokio::net::TcpStream;
use tokio::{io::AsyncWriteExt, task::spawn_blocking};
use tokio_tungstenite::{
    tungstenite::{
        self,
        protocol::{frame::coding::CloseCode, CloseFrame},
        Message,
    },
    MaybeTlsStream, WebSocketStream,
};

// NOTE: don't change without also changing in crates/holochain/src/main.rs
const MAGIC_STRING: &str = "Conductor ready.";

const CONDUCTOR_CONFIG_FILENAME: &str = "conductor-config.yml";
const LAIR_STDERR_LOG_FILENAME: &str = "lair-stderr.txt";
const CONDUCTOR_STDOUT_LOG_FILENAME: &str = "conductor-stdout.txt";
const CONDUCTOR_STDERR_LOG_FILENAME: &str = "conductor-stderr.txt";
const PLAYERS_DIR_PATH: &str = "/tmp/trycp/players";
const DNA_DIR_PATH: &str = "/tmp/trycp/dnas";
const FIRST_ADMIN_PORT: u16 = 9100;

static NEXT_ADMIN_PORT: AtomicU16 = AtomicU16::new(FIRST_ADMIN_PORT);

#[derive(StructOpt)]
struct Cli {
    #[structopt(
        long,
        short,
        help = "The port to run the trycp server on",
        default_value = "9000"
    )]
    port: u16,
}

fn get_player_dir(id: &str) -> PathBuf {
    Path::new(PLAYERS_DIR_PATH).join(id)
}

fn get_downloaded_dna_path(url: &url::Url) -> PathBuf {
    Path::new(DNA_DIR_PATH)
        .join(url.scheme())
        .join(url.path().replace("/", "").replace("%", "_"))
}

/// Tries to create a file, returning Ok(None) if a file already exists at path
async fn try_create_file(path: &Path) -> Result<Option<tokio::fs::File>, io::Error> {
    tokio::fs::create_dir_all(path.parent().unwrap()).await?;
    match tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .await
    {
        Ok(file) => Ok(Some(file)),
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => Ok(None),
        Err(e) => Err(e),
    }
}

fn player_config_exists(id: &str) -> bool {
    let file_path = get_player_dir(id).join(CONDUCTOR_CONFIG_FILENAME);
    file_path.is_file()
}

#[derive(Debug, Snafu)]
enum ConnectionError {
    #[snafu(display("Could not complete handshake with client: {}", source))]
    Handshake { source: tungstenite::Error },
    #[snafu(display("Could not read reqeuest from websocket: {}", source))]
    ReadRequest { source: tungstenite::Error },
    #[snafu(display("Could not write response to websocket: {}", source))]
    WriteResponse { source: tungstenite::Error },
    #[snafu(display("Expected a binary message, got: {:?}", message))]
    UnexpectedMessageType { message: Message },
    #[snafu(display("Could not deserialize bytes {:?} as MessagePack: {}", bytes, source))]
    DeserializeMessage {
        bytes: Vec<u8>,
        source: rmp_serde::decode::Error,
    },
}

async fn save_dna_wrapper(request_id: u64, id: String, content: Vec<u8>) -> Vec<u8> {
    spawn_blocking(move || {
        let resp = save_dna::save_dna(id, content).map_err(|e| e.to_string());
        serialize_resp(request_id, resp)
    })
    .await
    .unwrap()
}

async fn ws_message(
    message_res: Result<Message, tungstenite::Error>,
    ws_write: Arc<futures::lock::Mutex<WsResponseWriter>>,
) -> Result<Option<Message>, ConnectionError> {
    let message = message_res.context(ReadRequest)?;

    let bytes = match message {
        Message::Binary(bytes) => bytes,
        _ => return UnexpectedMessageType { message }.fail(),
    };

    let ReqeuestWrapper {
        id: request_id,
        request,
    } = rmp_serde::from_read_ref(&bytes).context(DeserializeMessage { bytes })?;

    let response = match request {
        Request::SaveDna { id, content } => save_dna_wrapper(request_id, id, content).await,

        Request::DownloadDna { url } => serialize_resp(
            request_id,
            download_dna(url).await.map_err(|e| e.to_string()),
        ),
        Request::ConfigurePlayer { id, partial_config } => spawn_blocking(move || {
            let resp = configure_player(id, partial_config).map_err(|e| e.to_string());
            serialize_resp(request_id, resp)
        })
        .await
        .unwrap(),
        Request::Startup { id, log_level } => spawn_blocking(move || {
            let resp = startup::startup(id, log_level).map_err(|e| e.to_string());
            serialize_resp(request_id, resp)
        })
        .await
        .unwrap(),
        Request::Shutdown { id, signal } => spawn_blocking(move || {
            let resp = shutdown(id, signal).map_err(|e| e.to_string());
            serialize_resp(request_id, resp)
        })
        .await
        .unwrap(),
        Request::Reset => spawn_blocking(move || serialize_resp(request_id, reset()))
            .await
            .unwrap(),
        Request::AdminApiCall { id, message } => admin_api_call(id, message).await,
        Request::ConnectAppInterface { port } => serialize_resp(
            request_id,
            connect_app_interface(port, ws_write)
                .await
                .map_err(|e| e.to_string()),
        ),
        Request::DisconnectAppInterface { port } => serialize_resp(
            request_id,
            disconnect_app_interface_by_port(port)
                .await
                .map_err(|e| e.to_string()),
        ),
        Request::CallAppInterface { port, message } => {
            match call_app_interface(request_id, port, message).await {
                Ok(()) => return Ok(None),
                Err(e) => serialize_resp(request_id, Err::<(), _>(e.to_string())),
            }
        }
    };

    Ok(Some(Message::Binary(response)))
}

async fn ws_connection(stream: TcpStream) -> Result<(), ConnectionError> {
    let ws_stream = tokio_tungstenite::accept_async(stream)
        .await
        .context(Handshake)?;

    let (ws_write, ws_read) = ws_stream.split();

    let ws_write1 = Arc::new(futures::lock::Mutex::new(ws_write));
    let ws_write2 = &ws_write1;

    let write = futures::sink::unfold((), |(), response| async {
        if let Some(response) = response {
            let mut ws_write_guard = ws_write1.lock().await;
            ws_write_guard.send(response).await.context(WriteResponse)
        } else {
            Ok(())
        }
    });

    ws_read
        .then(|message_res| ws_message(message_res, Arc::clone(ws_write2)))
        .forward(write)
        .await
}

#[derive(Debug, Snafu)]
enum CallAppInterfaceError {
    #[snafu(display("Not connected to app interface on port {}", port))]
    NotConnected { port: u16 },
    #[snafu(display("Could not send request: {}", source))]
    SendRequest { source: tungstenite::Error },
}

async fn call_app_interface(
    request_id: u64,
    port: u16,
    message: Vec<u8>,
) -> Result<(), CallAppInterfaceError> {
    let connection_lock = Arc::clone(
        APP_INTERFACE_CONNECTIONS
            .lock()
            .await
            .get(&port)
            .context(NotConnected { port })?,
    );
    let mut connection_guard = connection_lock.lock().await;
    let connection = connection_guard.as_mut().context(NotConnected { port })?;

    let holochain_request_id = connection.pending_requests.lock().await.insert(request_id);
    if let Err(e) = connection
        .request_writer
        .send(Message::Binary(
            rmp_serde::to_vec_named(&HolochainMessage::Request {
                id: holochain_request_id,
                data: message,
            })
            .unwrap(),
        ))
        .await
    {
        let mut pending_requests = connection.pending_requests.lock().await;
        if pending_requests.contains(holochain_request_id) {
            pending_requests.remove(holochain_request_id);
        }

        return Err(SendRequest.into_error(e));
    }

    Ok(())
}

#[derive(Debug, Snafu)]
enum DisconnectAppInterfaceError {
    #[snafu(display("Couldn't complete closing handshake: {}", source))]
    CloseHandshake { source: tungstenite::Error },
    #[snafu(display("Couldn't listen on app interface: {}", source))]
    Listen { source: listen_app_interface::Error },
}

async fn disconnect_app_interface_by_port(port: u16) -> Result<(), DisconnectAppInterfaceError> {
    let connection_lock = match APP_INTERFACE_CONNECTIONS.lock().await.get(&port) {
        Some(connection_lock) => Arc::clone(connection_lock),
        None => return Ok(()),
    };

    disconnect_app_interface(connection_lock).await
}

async fn disconnect_app_interface(
    connection_lock: Arc<futures::lock::Mutex<Option<AppInterfaceConnection>>>,
) -> Result<(), DisconnectAppInterfaceError> {
    let mut connection_guard = connection_lock.lock().await;
    let AppInterfaceConnection {
        mut request_writer,
        cancel_read_task,
        read_task,
        pending_requests: _,
    } = match connection_guard.take() {
        Some(connection) => connection,
        None => return Ok(()),
    };

    let close_handshake_result = request_writer
        .send(Message::Close(Some(CloseFrame {
            code: CloseCode::Normal,
            reason: "purpose fulfilled".into(),
        })))
        .await;

    cancel_read_task.abort();

    match read_task.await.unwrap() {
        Ok(Ok(())) | Err(future::Aborted) => close_handshake_result.context(CloseHandshake),
        Ok(Err(e)) => Err(Listen.into_error(e)),
    }
}

type WsRequestWriter = futures_util::stream::SplitSink<
    WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>,
    Message,
>;

type WsResponseWriter =
    futures_util::stream::SplitSink<WebSocketStream<tokio::net::TcpStream>, Message>;

type WsReader = SplitStream<WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>>;

type PendingRequests = Arc<futures::lock::Mutex<Slab<u64>>>;

struct AppInterfaceConnection {
    request_writer: WsRequestWriter,
    read_task:
        tokio::task::JoinHandle<Result<Result<(), listen_app_interface::Error>, future::Aborted>>,
    cancel_read_task: future::AbortHandle,
    pending_requests: PendingRequests,
}

#[derive(Debug, Snafu)]
enum ConnectAppInterfaceError {
    #[snafu(display(
        "Could not establish a websocket connection to app interface: {}",
        source
    ))]
    Connect { source: tungstenite::Error },
}

mod listen_app_interface {
    use std::sync::Arc;

    use futures::{SinkExt, TryStreamExt};
    use snafu::{IntoError, ResultExt, Snafu};
    use tokio_tungstenite::tungstenite;
    use tokio_tungstenite::tungstenite::Message;

    use crate::{
        serialize_resp, HolochainMessage, MessageToClient, PendingRequests, WsReader,
        WsResponseWriter,
    };

    #[derive(Debug, Snafu)]
    pub(crate) enum Error {
        #[snafu(display("Could not read from websocket: {}", source))]
        Read { source: tungstenite::Error },
        #[snafu(display("Expected a binary message, got: {:?}", message))]
        UnexpectedMessageType { message: Message },
        #[snafu(display("Could not deserialize bytes {:?} as MessagePack: {}", bytes, source))]
        DeserializeMessage {
            bytes: Vec<u8>,
            source: rmp_serde::decode::Error,
        },
        #[snafu(display("Could not send response to client: {}", source))]
        SendResponse { source: tungstenite::Error },
        #[snafu(display("Could not send signal to client: {}", source))]
        SendSignal { source: tungstenite::Error },
        #[snafu(display(
            "Received request from Holochain {:?} but Holochain is not supposed to make requests",
            request
        ))]
        UnexpectedRequest { request: HolochainMessage },
    }

    pub(crate) async fn listen_app_interface(
        port: u16,
        reader: WsReader,
        pending_requests: PendingRequests,
        response_writer: Arc<futures::lock::Mutex<WsResponseWriter>>,
    ) -> Result<(), Error> {
        reader
            .map_err(|e| Read.into_error(e))
            .try_for_each(|holochain_message| async {
                let bytes = match holochain_message {
                    Message::Binary(bytes) => bytes,
                    message => return UnexpectedMessageType { message }.fail(),
                };

                let deserialized: HolochainMessage =
                    rmp_serde::from_read_ref(&bytes).context(DeserializeMessage { bytes })?;

                match deserialized {
                    HolochainMessage::Response { id, data } => {
                        let call_request_id = {
                            let mut pending_requests_guard = pending_requests.lock().await;
                            if pending_requests_guard.contains(id) {
                                pending_requests_guard.remove(id)
                            } else {
                                println!("warn: received response with ID {} without a pending request of that ID", id);
                                return Ok(())
                            }
                        };

                        response_writer.lock().await.send(Message::Binary(serialize_resp(call_request_id, data))).await.context(SendResponse)?;
                    },
                    HolochainMessage::Signal { data } => {
                        response_writer.lock().await.send(Message::Binary(rmp_serde::to_vec_named(&MessageToClient::<()>::Signal{port, data}).unwrap())).await.context(SendSignal)?;
                    }
                    request @ HolochainMessage::Request { .. } =>  {
                        return UnexpectedRequest { request }.fail()
                    }
                }

                Ok(())
            })
            .await
    }
}

async fn connect_app_interface(
    port: u16,
    response_writer: Arc<futures::lock::Mutex<WsResponseWriter>>,
) -> Result<(), ConnectAppInterfaceError> {
    let connection_lock = Arc::clone(
        &APP_INTERFACE_CONNECTIONS
            .lock()
            .await
            .entry(port)
            .or_default(),
    );

    let mut connection = connection_lock.lock().await;
    if connection.is_some() {
        return Ok(());
    }

    let mut url = url::Url::parse("ws://localhost").expect("localhost to be valid URL");
    url.set_port(Some(9000)).expect("can set port on localhost");

    let (ws_stream, _resp) = tokio_tungstenite::connect_async(url)
        .await
        .context(Connect)?;

    let (request_writer, read) = ws_stream.split();

    let read: WsReader = read;

    let pending_requests = Arc::default();

    let read_future = listen_app_interface::listen_app_interface(
        port,
        read,
        Arc::clone(&pending_requests),
        response_writer,
    );
    let (abortable_read_future, abort_handle) = future::abortable(read_future);

    let read_task = tokio::task::spawn(abortable_read_future);

    *connection = Some(AppInterfaceConnection {
        read_task,
        cancel_read_task: abort_handle,
        pending_requests,
        request_writer,
    });

    Ok(())
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
enum HolochainMessage {
    Request {
        id: usize,
        #[serde(with = "serde_bytes")]
        data: Vec<u8>,
    },
    Response {
        id: usize,
        #[serde(with = "serde_bytes")]
        data: Vec<u8>,
    },
    Signal {
        #[serde(with = "serde_bytes")]
        data: Vec<u8>,
    },
}

#[derive(Debug, Snafu)]
enum DownloadDnaError {
    #[snafu(display("Could not parse URL {:?}: {}", url, source))]
    ParseUrl {
        url: String,
        source: url::ParseError,
    },
    #[snafu(display("Could not create DNA file at {}: {}", path.display(), source))]
    CreateDna { path: PathBuf, source: io::Error },
    #[snafu(display("Could not open source DNA file at {}: {}", path, source))]
    OpenSource { path: String, source: io::Error },
    #[snafu(display("Could not write to DNA file at {}: {}", path.display(), source))]
    WriteDna { path: PathBuf, source: io::Error },
    #[snafu(display("Could not download source DNA from {}: {}", url, source))]
    RequestDna { url: String, source: reqwest::Error },
    #[snafu(display("Could not parse HTTP response from {}: {}", url, source))]
    ParseResponse { url: String, source: reqwest::Error },
}

async fn download_dna(url_str: String) -> Result<String, DownloadDnaError> {
    let url = url::Url::parse(&url_str).with_context(|| ParseUrl {
        url: url_str.clone(),
    })?;

    let path = get_downloaded_dna_path(&url);
    let path_string = path
        .to_str()
        .expect("path constructed from UTF-8 filename and UTF-8 directory should be valid UTF-8")
        .to_owned();

    let mut file = match try_create_file(&path).await {
        Ok(Some(file)) => file,
        Ok(None) => return Ok(path_string),
        Err(err) => return Err(CreateDna { path }.into_error(err)),
    };

    if url.scheme() == "file" {
        let source_path = url.path();
        let mut dna_file =
            tokio::fs::File::open(source_path)
                .await
                .with_context(|| OpenSource {
                    path: source_path.to_owned(),
                })?;
        tokio::io::copy(&mut dna_file, &mut file)
            .await
            .context(WriteDna { path })?;
    } else {
        println!("Downloading dna from {} ...", &url_str);
        let response = reqwest::get(url).await.with_context(|| RequestDna {
            url: url_str.clone(),
        })?;

        let content = response.bytes().await.with_context(|| ParseResponse {
            url: url_str.clone(),
        })?;
        println!("Finished downloading dna from {}", url_str);

        file.write_all(&content).await.context(WriteDna { path })?;
    };

    Ok(path_string)
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
struct ReqeuestWrapper {
    id: u64,
    request: Request,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum Request {
    // Given a DNA file, stores the DNA and returns the path at which it is stored.
    SaveDna {
        id: String,
        #[serde(with = "serde_bytes")]
        content: Vec<u8>,
    },
    // Given a DNA URL, ensures that the DNA is downloaded and returns the path at which it is stored.
    DownloadDna {
        url: String,
    },
    ConfigurePlayer {
        id: String,
        /// The Holochain configuration data that is not provided by trycp.
        ///
        /// For example:
        /// ```yaml
        /// signing_service_uri: ~
        /// encryption_service_uri: ~
        /// decryption_service_uri: ~
        /// dpki: ~
        /// network: ~
        /// ```
        partial_config: String,
    },
    Startup {
        id: String,
        log_level: Option<String>,
    },
    Shutdown {
        id: String,
        signal: Option<String>,
    },
    // Shuts down all running conductors.
    Reset,
    AdminApiCall {
        id: String,
        #[serde(with = "serde_bytes")]
        message: Vec<u8>,
    },
    ConnectAppInterface {
        port: u16,
    },
    DisconnectAppInterface {
        port: u16,
    },
    CallAppInterface {
        port: u16,
        #[serde(with = "serde_bytes")]
        message: Vec<u8>,
    },
}

fn serialize_resp<R: Serialize>(id: u64, data: R) -> Vec<u8> {
    rmp_serde::to_vec_named(&MessageToClient::Response { data, id }).unwrap()
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
enum MessageToClient<R> {
    Signal { port: u16, data: Vec<u8> },
    Response { id: u64, data: R },
}

#[derive(Debug, Snafu)]
enum ConfigurePlayerError {
    #[snafu(display("Could not create directory for at {}: {}", path.display(), source))]
    CreateDir { path: PathBuf, source: io::Error },
    #[snafu(display("Could not create config file at {}: {}", path.display(), source))]
    CreateConfig { path: PathBuf, source: io::Error },
    #[snafu(display("Ran out of possible admin ports"))]
    OutOfPorts,
    #[snafu(display("Could not write to config file at {}: {}", path.display(), source))]
    WriteConfig { path: PathBuf, source: io::Error },
}

fn configure_player(id: String, partial_config: String) -> Result<(), ConfigurePlayerError> {
    let player_dir = get_player_dir(&id);
    let config_path = player_dir.join(CONDUCTOR_CONFIG_FILENAME);

    std::fs::create_dir_all(&player_dir).with_context(|| CreateDir {
        path: config_path.clone(),
    })?;

    let mut config_file = std::fs::File::create(&config_path).with_context(|| CreateConfig {
        path: config_path.clone(),
    })?;

    ensure!(
        NEXT_ADMIN_PORT.load(atomic::Ordering::SeqCst) != 0,
        OutOfPorts
    );
    let port = NEXT_ADMIN_PORT.fetch_add(1, atomic::Ordering::SeqCst);

    writeln!(
        config_file,
        "\
---
environment_path: environment
use_dangerous_test_keystore: false
keystore_path: keystore
passphrase_service:
    type: fromconfig
    passphrase: password
admin_interfaces:
    -
    driver:
        type: websocket
        port: {}
{}",
        port, partial_config
    )
    .with_context(|| WriteConfig {
        path: config_path.clone(),
    })?;

    println!(
        "wrote config for player {} to {}",
        id,
        config_path.display()
    );
    Ok(())
}

/// Ensures that a key is present in the hashmap, using the least amount of locking.
///
/// Panics if `read_guard` is `None`. (`read_guard` is only optional due to an implementation detail.)
fn get_or_insert_default_locked<'lock, 'guard, K, V>(
    lock: &'lock RwLock<HashMap<K, V>>,
    read_guard: &'guard mut Option<RwLockReadGuard<'lock, HashMap<K, V>>>,
    key: &K,
) -> &'guard V
where
    'lock: 'guard,
    K: Hash + Eq + Clone,
    V: Default,
{
    // Optimistically check if we can get the value without creating a write lock.
    if !read_guard.as_ref().unwrap().contains_key(key) {
        // Release the read lock.
        read_guard.take();
        let mut write_guard = lock.write();
        if !write_guard.contains_key(key) {
            write_guard.insert(key.clone(), Default::default());
        }
        // Restore the read lock without allowing the entry to be removed.
        *read_guard = Some(RwLockWriteGuard::downgrade(write_guard));
    }
    read_guard.as_mut().unwrap().get(key).unwrap()
}

#[derive(Debug, Snafu)]
enum ShutdownError {
    #[snafu(display("Could not find a configuration for player with ID {:?}", id))]
    PlayerNotConfigured { id: String },
    #[snafu(display("The specified signal {:?} is invalid", signal))]
    UnrecognizedSignal { signal: String },
    #[snafu(context(false))]
    Kill { source: KillError },
}

fn shutdown(id: String, signal: Option<String>) -> Result<(), ShutdownError> {
    ensure!(player_config_exists(&id), PlayerNotConfigured { id });

    let signal = match signal.as_deref() {
        Some("SIGTERM") | None => Signal::SIGTERM,
        Some("SIGKILL") => Signal::SIGKILL,
        Some("SIGINT") => Signal::SIGINT,
        Some(s) => {
            return Err(ShutdownError::UnrecognizedSignal {
                signal: s.to_owned(),
            })
        }
    };

    let players_guard = PLAYERS.read();
    let player_lock = match players_guard.get(&id) {
        Some(player_lock) => player_lock,
        None => return Ok(()),
    };

    let mut player_cell = player_lock.lock();

    kill_player(&mut player_cell, &id, signal)?;

    Ok(())
}

#[derive(Debug, Snafu)]
enum KillError {
    #[snafu(display("Could not kill holochain: {}", source))]
    KillHolochain { source: nix::Error },
    #[snafu(display("Could not kill lair: {}", source))]
    KillLair { source: nix::Error },
}

fn kill_player(
    player_cell: &mut Option<Player>,
    id: &str,
    signal: Signal,
) -> Result<(), KillError> {
    let player = match &mut *player_cell {
        Some(player) => player,
        None => return Ok(()),
    };

    println!("stopping player with id: {}", id);

    signal::kill(Pid::from_raw(player.holochain.id() as i32), signal).context(KillHolochain)?;
    player.holochain.wait().unwrap();
    signal::kill(Pid::from_raw(player.lair.id() as i32), signal).context(KillLair)?;
    player.lair.wait().unwrap();

    *player_cell = None;
    Ok(())
}

fn reset() {
    let (players, connections) = {
        let mut players_lock = PLAYERS.write();
        let mut connections_lock = futures::executor::block_on(APP_INTERFACE_CONNECTIONS.lock());
        NEXT_ADMIN_PORT.store(FIRST_ADMIN_PORT, atomic::Ordering::SeqCst);
        (
            std::mem::take(&mut *players_lock),
            std::mem::take(&mut *connections_lock),
        )
    };

    // for (port, app_interface_connection_state_once_cell) in connections {
    //     if let Some((sender, _)) = app_interface_connection_state_once_cell.into_inner() {
    //         if let Err(e) = sender.close(ws::CloseCode::Normal) {
    //             println!(
    //                 "warn: failed to close websocket on app interface port {}: {}",
    //                 port, e
    //             )
    //         }
    //     }
    // }

    for (id, mut player) in players {
        if let Err(e) = kill_player(player.get_mut(), &id, Signal::SIGKILL) {
            println!("warn: failed to kill player {:?}: {}", id, e);
        }
    }
}

async fn admin_api_call(id: String, message: Vec<u8>) -> Vec<u8> {
    // println!("admin_interface_call id: {:?}", id);

    // let port = maybe_port.ok_or_else(|| {
    //     invalid_request(format!(
    //         "failed to call player admin interface: player not yet configured"
    //     ))
    // })?;

    // let response_buf = holochain_interface::remote_call(port, message)?;
    // Ok(Value::String(base64::encode(&response_buf)))
}
struct Player {
    lair: Child,
    holochain: Child,
}

static PLAYERS: Lazy<RwLock<HashMap<String, Mutex<Option<Player>>>>> = Lazy::new(RwLock::default);

static APP_INTERFACE_CONNECTIONS: Lazy<
    futures::lock::Mutex<HashMap<u16, Arc<futures::lock::Mutex<Option<AppInterfaceConnection>>>>>,
> = Lazy::new(Default::default);

#[derive(Debug, Snafu)]
enum Error {
    #[snafu(display("Could not remove trycp/ directory on startup: {}", source))]
    RemoveDir { source: io::Error },
    #[snafu(display("Could not bind websocket server: {}", source))]
    BindServer { source: io::Error },
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    let args = Cli::from_args();

    tokio::fs::remove_dir_all("/tmp/trycp")
        .await
        .context(RemoveDir)?;

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", args.port))
        .await
        .context(BindServer)?;

    while let Ok((stream, _addr)) = listener.accept().await {
        tokio::spawn(ws_connection(stream)).await;
    }

    Ok(())
}
