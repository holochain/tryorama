use futures::{SinkExt, StreamExt};
use snafu::{OptionExt, ResultExt, Snafu};
use tokio::task::spawn_blocking;
use tokio_tungstenite::tungstenite::{
    self,
    protocol::{frame::coding::CloseCode, CloseFrame},
    Message,
};

use crate::{HolochainMessage, WsClientDuplex, PLAYERS};

#[derive(Debug, Snafu)]
pub(crate) enum AdminCallError {
    #[snafu(display("Could not find a configuration for player with ID {:?}", id))]
    PlayerNotConfigured { id: String },
    #[snafu(display("Could not establish a websocket connection: {}", source))]
    Connect { source: tungstenite::Error },
    #[snafu(context(false))]
    Call { source: CallError },
}

pub(crate) async fn admin_call(id: String, message: Vec<u8>) -> Result<Vec<u8>, AdminCallError> {
    println!("admin_interface_call id: {:?}", id);

    let id2 = id.clone();
    let port = spawn_blocking(move || PLAYERS.read().get(&id2).map(|player| player.admin_port))
        .await
        .unwrap()
        .context(PlayerNotConfigured { id })?;

    let mut url = url::Url::parse("ws://localhost").expect("localhost to be valid URL");
    url.set_port(Some(port)).expect("can set port on localhost");

    println!("Established admin interface with {}", url);

    let (mut ws_stream, _resp) = tokio_tungstenite::connect_async(url)
        .await
        .context(Connect)?;

    let call_result = call(&mut ws_stream, 0, message).await;
    let _ = ws_stream
        .send(Message::Close(Some(CloseFrame {
            code: CloseCode::Normal,
            reason: "fulfilled purpose".into(),
        })))
        .await;

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

    let ws_message = ws_stream
        .next()
        .await
        .context(NoResponse)?
        .context(ReceiveResponse)?;
    let ws_data = if let Message::Binary(ws_data) = ws_message {
        ws_data
    } else {
        return UnexpectedResponseType {
            response: ws_message,
        }
        .fail();
    };

    let message: HolochainMessage = rmp_serde::from_slice(&ws_data)
        .with_context(|| DeserializeResponse { response: ws_data })?;

    let response_data = if let HolochainMessage::Response { id: _, data } = message {
        data
    } else {
        return UnexpectedMessageType { message }.fail();
    };

    Ok(response_data)
}
