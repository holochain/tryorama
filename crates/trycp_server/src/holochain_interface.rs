use serde_derive::{Deserialize, Serialize};

use crate::rpc_util::internal_error;

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
enum HolochainInterfaceMessage {
    Request {
        #[serde(rename = "id")]
        message_id: String,
        #[serde(with = "serde_bytes")]
        data: Vec<u8>,
    },
    Response {
        #[serde(rename = "id")]
        message_id: String,
        #[serde(with = "serde_bytes")]
        data: Vec<u8>,
    },
}

fn holochain_request(data_buf: Vec<u8>) -> Result<Vec<u8>, rmp_serde::encode::Error> {
    let msg = HolochainInterfaceMessage::Request {
        message_id: String::new(),
        data: data_buf,
    };
    rmp_serde::to_vec_named(&msg)
}

fn parse_holochain_response(response: ws::Message) -> Result<Vec<u8>, String> {
    let response_buf = match response {
        ws::Message::Binary(buf) => buf,
        r => return Err(format!("unexpected response from conductor: {:?}", r)),
    };
    let response_msg: HolochainInterfaceMessage =
        rmp_serde::from_slice(&response_buf).map_err(|e| {
            format!(
                "failed to parse response from conductor as MessagePack: {}",
                e
            )
        })?;
    match response_msg {
        HolochainInterfaceMessage::Response { data, .. } => Ok(data),
        r => return Err(format!("unexpected message type from conductor: {:?}", r)),
    }
}

pub fn remote_call(port: u16, data_buf: Vec<u8>) -> Result<Vec<u8>, jsonrpc_core::Error> {
    let message_buf = holochain_request(data_buf).expect("serialization cannot fail");
    let (res_tx, res_rx) = crossbeam::channel::bounded(1);
    let mut capture_vars = Some((res_tx, message_buf));
    ws::connect(format!("ws://localhost:{}", port), move |out| {
        // Even though this closure is only called once, the API requires FnMut
        // so we must use a workaround to take ownership of our captured variables
        let (res_tx, message_buf) = capture_vars.take().unwrap();

        let send_response = match out.send(message_buf) {
            Ok(()) => true,
            Err(e) => {
                res_tx.send(Err(internal_error(format!("failed to send message along conductor interface: {}", e)))).unwrap();
                if let Err(e) = out.close(ws::CloseCode::Error) {
                    println!("warning: silently ignoring error: failed to close conductor interface connection: {}", e);
                }
                false
            }
        };
        move |response| {
            println!("received conductor interface response: {:?}", response);
            if send_response {
                res_tx.send(Ok(response)).unwrap();
                out.close(ws::CloseCode::Normal)
            } else {
                println!("warning: ignoring conductor interface response");
                Ok(())
            }
        }
    }).map_err(|e| internal_error(format!("failed to connect to conductor interface: {}", e)))?;

    let response = res_rx.recv().unwrap()?;
    parse_holochain_response(response)
        .map_err(|e| internal_error(format!("failed to parse conductor response: {}", e)))
}
