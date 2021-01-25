use std::{sync::Arc, thread};

use parking_lot::Mutex;
use serde_derive::{Deserialize, Serialize};
use slab::Slab;

use crate::rpc_util::internal_error;

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
enum Message {
    Request {
        id: String,
        #[serde(with = "serde_bytes")]
        data: Vec<u8>,
    },
    Response {
        id: String,
        #[serde(with = "serde_bytes")]
        data: Vec<u8>,
    },
    Signal {
        #[serde(with = "serde_bytes")]
        data: Vec<u8>,
    },
}

pub fn request(id: String, data_buf: Vec<u8>) -> Vec<u8> {
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
    let message_buf = request(String::new(), data_buf);
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

#[derive(Default)]
pub struct AppConnectionState {
    // Contains the base64-encoded payload of each message of type "Signal" received since last polled by tryorama
    pub signals_accumulated: Vec<serde_json::Value>,
    // Contains channels indexed by request ID for receiving a response after making a request.
    pub responses_awaited: Slab<crossbeam::channel::Sender<ws::Result<String>>>,
}

pub fn connect_app_interface(
    port: u16,
    connected_callback: impl FnOnce(ws::Sender) -> Arc<Mutex<AppConnectionState>> + Send + 'static,
    err_callback: impl FnOnce(ws::Error) + Send + 'static,
) {
    thread::spawn(move || {
        // Put our closure into an Option to satisfy the FnMut bound,
        // even though the closure will only be called once.
        let mut on_connect = Some(|handle| {
            let app_connection_state = connected_callback(handle);
            move |message| {
                handle_app_interface_response(message, &app_connection_state);
                Ok(())
            }
        });
        let res = ws::connect(format!("ws://localhost:{}", port), |handle| {
            on_connect.take().unwrap()(handle)
        });
        if let Err(e) = res {
            err_callback(e);
        }
    });
}

fn handle_app_interface_response(
    message: ws::Message,
    app_connection_state: &Mutex<AppConnectionState>,
) {
    match parse_holochain_message(message) {
        Ok(Message::Signal { data }) => {
            let encoded = base64::encode(data);
            app_connection_state
                .lock()
                .signals_accumulated
                .push(serde_json::Value::String(encoded));
        }
        Ok(Message::Response { id, data }) => {
            let id: usize = match id.parse() {
                Ok(id) => id,
                Err(_) => {
                    println!("warning: received response with unexpected ID from app interface; dropping");
                    return;
                }
            };
            let encoded = base64::encode(data);
            let mut app_connection_state_lock_guard = app_connection_state.lock();
            let responses_awaited = &mut app_connection_state_lock_guard.responses_awaited;
            if !responses_awaited.contains(id) {
                println!("warning: received unexpected response from app interface; dropping");
                return;
            }
            responses_awaited.remove(id).send(Ok(encoded)).unwrap()
        }
        Ok(Message::Request { .. }) => {
            println!("warning: received unexpected request from app interface; dropping")
        }
        Err(e) => println!(
            "warning: could not parse message from app interface: {:?}",
            e
        ),
    };
}
