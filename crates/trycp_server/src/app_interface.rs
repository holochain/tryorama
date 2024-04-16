use std::{collections::HashMap, sync::Arc};

use futures::{future, SinkExt, StreamExt, TryStreamExt};
use once_cell::sync::Lazy;
use slab::Slab;
use snafu::{IntoError, OptionExt, ResultExt, Snafu};
use tokio_tungstenite::tungstenite::handshake::client::Request;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::{self, protocol::CloseFrame};
use tokio_tungstenite::tungstenite::{protocol::frame::coding::CloseCode, Message};

use crate::{
    serialize_resp, HolochainMessage, MessageToClient, WsReader, WsRequestWriter, WsResponseWriter,
};

pub(crate) struct Connection {
    request_writer: WsRequestWriter,
    listen_task: tokio::task::JoinHandle<Result<Result<(), ListenError>, future::Aborted>>,
    cancel_listen_task: future::AbortHandle,
    pending_requests: PendingRequests,
}

pub(crate) static CONNECTIONS: Lazy<
    futures::lock::Mutex<HashMap<u16, Arc<futures::lock::Mutex<Option<Connection>>>>>,
> = Lazy::new(Default::default);

type PendingRequests = Arc<futures::lock::Mutex<Slab<u64>>>;

#[derive(Debug, Snafu)]
pub(crate) enum ConnectError {
    #[snafu(display("Could not establish a tcp connection to app interface: {}", source))]
    TcpConnect { source: std::io::Error },
    #[snafu(display(
        "Could not establish a websocket connection to app interface: {}",
        source
    ))]
    WsConnect { source: tungstenite::Error },
}

pub(crate) async fn connect(
    port: u16,
    response_writer: Arc<futures::lock::Mutex<WsResponseWriter>>,
) -> Result<(), ConnectError> {
    let connection_lock = Arc::clone(&CONNECTIONS.lock().await.entry(port).or_default());

    let mut connection = connection_lock.lock().await;
    if connection.is_some() {
        return Ok(());
    }

    let addr = format!("localhost:{port}");
    let stream = tokio::net::TcpStream::connect(addr.clone())
        .await
        .context(TcpConnect)?;
    let uri = format!("ws://{}", addr);
    let request = Request::builder()
        .uri(uri.clone())
        // needed for admin websocket connection to be accepted
        .header("origin", "tryorama-interface")
        .body(())
        .expect("request to be valid");

    println!("Establishing app interface with {:?}", uri);

    let (ws_stream, _) = tokio_tungstenite::client_async_with_config(
        request,
        stream,
        Some(WebSocketConfig::default()),
    )
    .await
    .context(WsConnect)?;

    let (request_writer, read) = ws_stream.split();

    let read: WsReader = read;

    let pending_requests = Arc::default();

    let listen_future = listen(port, read, Arc::clone(&pending_requests), response_writer);
    let (abortable_listen_future, abort_handle) = future::abortable(listen_future);

    let listen_task = tokio::task::spawn(abortable_listen_future);

    *connection = Some(Connection {
        listen_task,
        cancel_listen_task: abort_handle,
        pending_requests,
        request_writer,
    });

    Ok(())
}

#[derive(Debug, Snafu)]
pub(crate) enum ListenError {
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

pub(crate) async fn listen(
    port: u16,
    reader: WsReader,
    pending_requests: PendingRequests,
    response_writer: Arc<futures::lock::Mutex<WsResponseWriter>>,
) -> Result<(), ListenError> {
    let result = reader
        .map_err(|e| Read.into_error(e))
        .try_for_each(|holochain_message| async {
            let bytes = match holochain_message {
                Message::Binary(bytes) => bytes,
                Message::Ping(p) => {
                    response_writer.lock().await.send(Message::Pong(p)).await.context(SendResponse)?;
                    return Ok(());
                },
                message => return UnexpectedMessageType { message }.fail(),
            };

            let deserialized: HolochainMessage = rmp_serde::from_slice(&bytes).context(DeserializeMessage { bytes })?;

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

                    response_writer.lock().await.send(Message::Binary(serialize_resp(call_request_id, Ok::<_, String>(data)))).await.context(SendResponse)?;
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
        .await;
    println!("App listener closed: {:?}", result);
    Ok(())
}

#[derive(Debug, Snafu)]
pub(crate) enum DisconnectError {
    #[snafu(display("Couldn't complete closing handshake: {}", source))]
    CloseHandshake { source: tungstenite::Error },
    #[snafu(display("Couldn't listen on app interface: {}", source))]
    Listen { source: ListenError },
}

pub(crate) async fn disconnect_by_port(port: u16) -> Result<(), DisconnectError> {
    let connection_lock = match CONNECTIONS.lock().await.get(&port) {
        Some(connection_lock) => Arc::clone(connection_lock),
        None => return Ok(()),
    };

    disconnect(connection_lock).await
}

pub(crate) async fn disconnect(
    connection_lock: Arc<futures::lock::Mutex<Option<Connection>>>,
) -> Result<(), DisconnectError> {
    let mut connection_guard = connection_lock.lock().await;
    let Connection {
        mut request_writer,
        cancel_listen_task,
        listen_task,
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

    cancel_listen_task.abort();

    match listen_task.await.unwrap() {
        Ok(Ok(())) | Err(future::Aborted) => close_handshake_result.context(CloseHandshake),
        Ok(Err(e)) => Err(Listen.into_error(e)),
    }
}

#[derive(Debug, Snafu)]
pub(crate) enum CallError {
    #[snafu(display("Not connected to app interface on port {}", port))]
    NotConnected { port: u16 },
    #[snafu(display("Could not send request: {}", source))]
    SendRequest { source: tungstenite::Error },
}

pub(crate) async fn call(request_id: u64, port: u16, message: Vec<u8>) -> Result<(), CallError> {
    let connection_lock = Arc::clone(
        CONNECTIONS
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
