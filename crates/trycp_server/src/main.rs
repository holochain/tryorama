//! trycp_server listens for remote commands issued by tryorama and does as requested
//! with a set of Holochain conductors that it manages on the local machine.

mod admin_call;
mod app_interface;
mod configure_player;
mod reset;
mod save_dna;
mod startup;

use std::{
    collections::HashMap,
    fmt::Debug,
    io,
    path::{Path, PathBuf},
    process::Child,
    sync::{atomic::AtomicU16, Arc},
};

use futures::{stream::SplitStream, SinkExt, StreamExt};
use nix::{
    sys::signal::{self, Signal},
    unistd::Pid,
};
use once_cell::sync::Lazy;
use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};
use snafu::ResultExt;
use snafu::{ensure, IntoError, Snafu};
use structopt::StructOpt;
use tokio::net::TcpStream;
use tokio::{io::AsyncWriteExt, task::spawn_blocking};
use tokio_tungstenite::{
    tungstenite::{self, Message},
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
    #[snafu(display(
        "Could not deserialize bytes {:?} as RequestWrapper: {}",
        bytes,
        source
    ))]
    DeserializeRequestWrapper {
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
        Message::Close(..) => {
            println!("Received websocket close handshake");
            return Ok(None);
        }
        Message::Ping(..) => {
            println!("Received websocket ping");
            return Ok(None);
        }
        _ => return UnexpectedMessageType { message }.fail(),
    };

    let RequestWrapper {
        id: request_id,
        request,
    } = rmp_serde::from_read_ref(&bytes).context(DeserializeRequestWrapper { bytes })?;

    let response = match request {
        Request::SaveDna { id, content } => save_dna_wrapper(request_id, id, content).await,

        Request::DownloadDna { url } => serialize_resp(
            request_id,
            download_dna(url).await.map_err(|e| e.to_string()),
        ),
        Request::ConfigurePlayer { id, partial_config } => spawn_blocking(move || {
            let resp =
                configure_player::configure_player(id, partial_config).map_err(|e| e.to_string());
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
        Request::Reset => spawn_blocking(move || {
            serialize_resp(request_id, reset::reset().map_err(|e| e.to_string()))
        })
        .await
        .unwrap(),
        Request::CallAdminInterface { id, message } => serialize_resp(
            request_id,
            admin_call::admin_call(id, message)
                .await
                .map_err(|e| e.to_string()),
        ),
        Request::ConnectAppInterface { port } => serialize_resp(
            request_id,
            app_interface::connect(port, ws_write)
                .await
                .map_err(|e| e.to_string()),
        ),
        Request::DisconnectAppInterface { port } => serialize_resp(
            request_id,
            app_interface::disconnect_by_port(port)
                .await
                .map_err(|e| e.to_string()),
        ),
        Request::CallAppInterface { port, message } => {
            match app_interface::call(request_id, port, message).await {
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

type WsRequestWriter =
    futures::stream::SplitSink<WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>, Message>;

type WsResponseWriter = futures::stream::SplitSink<WebSocketStream<tokio::net::TcpStream>, Message>;

type WsClientDuplex = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

type WsReader = SplitStream<WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>>;

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
struct RequestWrapper {
    id: u64,
    request: Request,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
#[serde(tag = "type")]
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
    CallAdminInterface {
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
    rmp_serde::to_vec_named(&MessageToClient::Response { response: data, id }).unwrap()
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
#[serde(tag = "type")]
enum MessageToClient<R> {
    Signal { port: u16, data: Vec<u8> },
    Response { id: u64, response: R },
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
    let processes_lock = match players_guard.get(&id) {
        Some(player) => &player.processes,
        None => return Ok(()),
    };

    let mut player_cell = processes_lock.lock();

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
    player_cell: &mut Option<PlayerProcesses>,
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

#[derive(Default)]
struct Player {
    admin_port: u16,
    processes: Mutex<Option<PlayerProcesses>>,
}

struct PlayerProcesses {
    lair: Child,
    holochain: Child,
}

static PLAYERS: Lazy<RwLock<HashMap<String, Player>>> = Lazy::new(RwLock::default);

#[derive(Debug, Snafu)]
enum Error {
    #[snafu(display("Could not bind websocket server: {}", source))]
    BindServer { source: io::Error },
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    let args = Cli::from_args();

    let _ = tokio::fs::remove_dir_all("/tmp/trycp").await;

    let addr = format!("0.0.0.0:{}", args.port);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .context(BindServer)?;

    println!("Listening on {}", addr);

    let mut client_futures = vec![];
    while let Ok((stream, addr)) = listener.accept().await {
        client_futures.push(tokio::spawn(async move {
            ws_connection(stream)
                .await
                .unwrap_or_else(|e| println!("Error serving client from address ({}): {}", addr, e))
        }));
    }

    futures::future::join_all(client_futures).await;

    Ok(())
}
