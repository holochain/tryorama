use serde::{Deserialize, Serialize};

use crate::rpc_util::internal_error;

pub mod app;

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
enum Message {
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

pub fn request(id: usize, data_buf: Vec<u8>) -> Vec<u8> {
    let msg = Message::Request { id, data: data_buf };
    rmp_serde::to_vec_named(&msg).expect("serialization cannot fail")
}

fn parse_holochain_message(message: ws::Message) -> Result<Message, String> {
    let response_buf = match message {
        ws::Message::Binary(buf) => buf,
        r => return Err(format!("unexpected response from conductor: {:?}", r)),
    };
    rmp_serde::from_slice(&response_buf).map_err(|e| {
        format!(
            "failed to parse response from conductor as MessagePack: {}",
            e
        )
    })
}

fn parse_holochain_response(response: ws::Message) -> Result<Vec<u8>, String> {
    match parse_holochain_message(response)? {
        Message::Response { data, .. } => Ok(data),
        r => return Err(format!("unexpected message type from conductor: {:?}", r)),
    }
}

pub fn remote_call(port: u16, data_buf: Vec<u8>) -> Result<Vec<u8>, jsonrpc_core::Error> {
    let id = 1;
    let message_buf = request(id, data_buf);
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
