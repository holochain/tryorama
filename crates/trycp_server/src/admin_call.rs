use crate::{HolochainMessage, WsClientDuplex, PLAYERS};
use futures::lock::Mutex;
use futures::{SinkExt, StreamExt};
use once_cell::sync::Lazy;
use snafu::{OptionExt, ResultExt, Snafu};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio::time::error::Elapsed;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::{
    self, client::IntoClientRequest, protocol::WebSocketConfig, Message,
};
use tokio_tungstenite::WebSocketStream;

pub(crate) static ADMIN_CONNECTIONS: Lazy<
    futures::lock::Mutex<HashMap<String, Arc<futures::lock::Mutex<WebSocketStream<TcpStream>>>>>,
> = Lazy::new(Default::default);

#[derive(Debug, Snafu)]
pub(crate) enum AdminCallError {
    #[snafu(display("Could not find a configuration for player with ID {:?}", id))]
    PlayerNotConfigured { id: String },
    #[snafu(display("Could not establish a tcp connection: {}", source))]
    TcpConnect { source: std::io::Error },
    #[snafu(display("Could not establish a websocket connection: {}", source))]
    WsConnect { source: tungstenite::Error },
    #[snafu(context(false))]
    Call { source: CallError },
}

pub(crate) async fn admin_call(id: String, message: Vec<u8>) -> Result<Vec<u8>, AdminCallError> {
    println!("admin_interface_call id: {:?}", id);

    let mut admin_connections = ADMIN_CONNECTIONS.lock().await;
    if !admin_connections.contains_key(&id) {
        let port = PLAYERS
            .read()
            .get(&id)
            .map(|player| player.admin_port)
            .context(PlayerNotConfigured { id: id.clone() })?;

        let stream = tokio::net::TcpStream::connect(("localhost", port))
            .await
            .context(TcpConnect)?;

        let uri = format!("ws://localhost:{}", port);
        let mut request = uri.clone().into_client_request().expect("not a valid URI");
        // needed for admin websocket connection to be accepted
        request.headers_mut().insert(
            "origin",
            "trycp-admin".parse().expect("invalid origin header value"),
        );
        request.body();

        println!("Establishing admin interface with {:?}", uri);

        let (ws_stream, _) = tokio_tungstenite::client_async_with_config(
            request,
            stream,
            Some(WebSocketConfig::default()),
        )
        .await
        .context(WsConnect)?;

        println!("Established admin interface");

        admin_connections.insert(id.clone(), Arc::new(futures::lock::Mutex::new(ws_stream)));
    }

    let mut ws_stream = admin_connections[&id].lock().await;

    let call_result = call(&mut ws_stream, 0, message).await;

    Ok(call_result?)
}

#[derive(Debug, Snafu)]
pub(crate) enum CallError {
    #[snafu(display("Could not send request over websocket: {}", source))]
    SendRequest { source: tungstenite::Error },
    #[snafu(display("Did not receive response over websocket"))]
    NoResponse,
    #[snafu(display("Could not receive response over websocket: {}", source))]
    ReceiveResponse { source: tungstenite::Error },
    #[snafu(display("Expected a binary response, got {:?}", response))]
    UnexpectedResponseType { response: Message },
    #[snafu(display("Timeout while making call"))]
    ResponseTimeout { source: Elapsed },
    #[snafu(display(
        "Could not deserialize response {:?} as MessagePack: {}",
        response,
        source
    ))]
    DeserializeResponse {
        response: Vec<u8>,
        source: rmp_serde::decode::Error,
    },
    #[snafu(display("Expected a message of type 'Response', got {:?}", message))]
    UnexpectedMessageType { message: HolochainMessage },
}

async fn call(
    ws_stream: &mut WsClientDuplex,
    request_id: usize,
    data: Vec<u8>,
) -> Result<Vec<u8>, CallError> {
    let request_data = rmp_serde::to_vec_named(&HolochainMessage::Request {
        id: request_id,
        data,
    })
    .unwrap();

    ws_stream
        .send(Message::Binary(request_data))
        .await
        .context(SendRequest)?;

    let ws_data = tokio::time::timeout(std::time::Duration::from_secs(30), async move {
        loop {
            let ws_message = ws_stream
                .next()
                .await
                .context(NoResponse)?
                .context(ReceiveResponse)?;
            match ws_message {
                Message::Close(_) => return Err(CallError::NoResponse),
                Message::Binary(ws_data) => {
                    return Ok(ws_data);
                }
                Message::Ping(p) => {
                    ws_stream
                        .send(Message::Pong(p))
                        .await
                        .context(SendRequest)?;
                }
                _ => {
                    return Err(CallError::UnexpectedResponseType {
                        response: ws_message,
                    });
                }
            }
        }
    })
    .await
    .context(ResponseTimeout)??;

    let message: HolochainMessage = rmp_serde::from_slice(&ws_data)
        .with_context(|| DeserializeResponse { response: ws_data })?;

    let response_data = if let HolochainMessage::Response { id: _, data } = message {
        data
    } else {
        return UnexpectedMessageType { message }.fail();
    };

    Ok(response_data)
}

#[derive(Debug, Snafu)]
pub(crate) enum AdminDisconnectError {
    #[snafu(display("Couldn't complete closing handshake: {}", source))]
    CloseHandshake { source: tungstenite::Error },
}

pub(crate) async fn disconnect(
    ws_stream: Arc<Mutex<WebSocketStream<TcpStream>>>,
) -> Result<(), AdminDisconnectError> {
    let _ = ws_stream
        .lock()
        .await
        .send(Message::Close(Some(CloseFrame {
            code: CloseCode::Normal,
            reason: "fulfilled purpose".into(),
        })))
        .await
        .context(CloseHandshake)?;

    Ok(())
}
