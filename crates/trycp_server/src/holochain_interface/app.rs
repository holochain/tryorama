use std::{collections::HashMap, mem, sync::Arc};

use jsonrpc_core::Params;
use once_cell::sync::OnceCell;
use parking_lot::{Mutex, RwLock, RwLockWriteGuard};
use serde::Deserialize;
use serde_json::{json, Value};
use slab::Slab;

use crate::rpc_util::{internal_error, invalid_request};

use super::{parse_holochain_message, Message};

#[derive(Default)]
pub struct ConnectionState {
    // Contains the base64-encoded payload of each message of type "Signal" received since last polled by tryorama
    pub signals_accumulated: Vec<serde_json::Value>,
    // Contains channels indexed by request ID for receiving a response after making a request.
    pub responses_awaited: Slab<crossbeam::channel::Sender<ws::Result<String>>>,
}

pub type Connections =
    Arc<RwLock<HashMap<u16, OnceCell<(ws::Sender, Arc<Mutex<ConnectionState>>)>>>>;

fn connect(
    connection_state_once_cell: &OnceCell<(ws::Sender, Arc<Mutex<ConnectionState>>)>,
    port: u16,
) -> Result<&(ws::Sender, Arc<Mutex<ConnectionState>>), ws::Error> {
    connection_state_once_cell.get_or_try_init(|| {
        let (tx, rx) = crossbeam::channel::bounded(0);
        std::thread::spawn(move || {
            // Put our closure into an Option to satisfy the FnMut bound,
            // even though the closure will only be called once.
            let mut on_connect = Some(|handle| {
                let connection_state = Arc::default();
                tx.send(Ok((handle, Arc::clone(&connection_state))))
                    .unwrap();
                move |message| {
                    handle_response(message, &connection_state);
                    Ok(())
                }
            });
            let mut socket = match ws::Builder::new()
                .with_settings(ws::Settings {
                    queue_size: 100,
                    max_connections: 200,
                    ..Default::default()
                })
                .build(|handle| on_connect.take().unwrap()(handle))
            {
                Ok(v) => v,
                Err(e) => return tx.send(Err(e)).unwrap(),
            };
            if let Err(e) =
                socket.connect(url::Url::parse(&format!("ws://localhost:{}", port)).unwrap())
            {
                return tx.send(Err(e)).unwrap();
            }
            if let Err(e) = socket.run() {
                return tx.send(Err(e)).unwrap();
            }
        });
        rx.recv().unwrap()
    })
}

fn handle_response(message: ws::Message, connection_state: &Mutex<ConnectionState>) {
    match parse_holochain_message(message) {
        Ok(Message::Signal { data }) => {
            let encoded = base64::encode(data);
            connection_state
                .lock()
                .signals_accumulated
                .push(serde_json::Value::String(encoded));
        }
        Ok(Message::Response { id, data }) => {
            let encoded = base64::encode(data);
            let mut connection_state_lock_guard = connection_state.lock();
            let responses_awaited = &mut connection_state_lock_guard.responses_awaited;
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

fn call(
    connections: &Connections,
    port: u16,
    message_base64: String,
) -> Result<Value, jsonrpc_core::Error> {
    let message_buf = base64::decode(&message_base64)
        .map_err(|e| invalid_request(format!("failed to decode message_base64: {}", e)))?;

    let rx = {
        let mut connections_read_guard = connections.read();
        let connection_state_once_cell =
            if let Some(connection_state_once_cell) = connections_read_guard.get(&port) {
                connection_state_once_cell
            } else {
                mem::drop(connections_read_guard);
                let mut connections_write_guard = connections.write();
                connections_write_guard
                    .entry(port)
                    .or_insert_with(OnceCell::new);
                connections_read_guard = RwLockWriteGuard::downgrade(connections_write_guard);
                connections_read_guard.get(&port).unwrap()
            };

        let (handle, connection_state) = connect(connection_state_once_cell, port)
            .map_err(|e| internal_error(format!("failed to connect to app interface: {}", e)))?;

        let mut connection_state_lock_guard = connection_state.lock();
        let vacant_response_entry = connection_state_lock_guard.responses_awaited.vacant_entry();
        match handle.send(crate::holochain_interface::request(
            vacant_response_entry.key(),
            message_buf,
        )) {
            Ok(()) => {
                let (tx, rx) = crossbeam::channel::bounded(0);
                vacant_response_entry.insert(tx);
                rx
            }
            Err(e) => {
                return Err(internal_error(format!(
                    "failed to send message along app interface: {}",
                    e
                )))
            }
        }
    };

    match rx.recv().unwrap() {
        Ok(string) => Ok(Value::String(string)),
        Err(e) => Err(internal_error(format!(
            "failed to send message along app interface: {}",
            e
        ))),
    }
}

pub fn add_methods(io: &mut jsonrpc_core::IoHandler, connections_arc: &Connections) {
    let connections = Arc::clone(&connections_arc);
    io.add_method("app_interface_call", move |params: Params| {
        #[derive(Deserialize)]
        struct AppApiCallParams {
            port: u16,
            message_base64: String,
        }
        let AppApiCallParams {
            port,
            message_base64,
        } = params.parse()?;
        println!("app_interface_call port: {:?}", port);
        call(&connections, port, message_base64)
    });

    let connections = Arc::clone(&connections_arc);
    io.add_method("connect_app_interface", move |params: Params| {
        #[derive(Deserialize)]
        struct ConnectAppInterfaceParams {
            port: u16,
        }
        let ConnectAppInterfaceParams { port } = params.parse()?;
        println!("connect_app_interface port: {:?}", port);

        {
            let mut connections_read_guard = connections.read();
            let connection_state_once_cell =
                if let Some(connection_state_once_cell) = connections_read_guard.get(&port) {
                    connection_state_once_cell
                } else {
                    mem::drop(connections_read_guard);
                    let mut connections_write_guard = connections.write();
                    connections_write_guard
                        .entry(port)
                        .or_insert_with(OnceCell::new);
                    connections_read_guard = RwLockWriteGuard::downgrade(connections_write_guard);
                    connections_read_guard.get(&port).unwrap()
                };

            connect(connection_state_once_cell, port).map_err(|e| {
                internal_error(format!("failed to connect to app interface: {}", e))
            })?;
        }
        Ok(Value::String("connected".to_string()))
    });

    let connections = Arc::clone(&connections_arc);
    io.add_method("disconnect_app_interface", move |params: Params| {
        #[derive(Deserialize)]
        struct DisconnectAppInterfaceParams {
            port: u16,
        }
        let DisconnectAppInterfaceParams { port } = params.parse()?;
        println!("disconnect_app_interface port: {:?}", port);

        let maybe_connection_cell = connections.write().remove(&port);
        if let Some(connection_cell) = maybe_connection_cell {
            if let Some(connection) = connection_cell.into_inner() {
                connection
                    .0
                    .close(ws::CloseCode::Normal)
                    .map_err(|e| internal_error(format!("failed to disconnect: {}", e)))?;
                Ok(Value::String("disconnected successfully".to_owned()))
            } else {
                Ok(Value::String("warning: already disconnected".to_owned()))
            }
        } else {
            Ok(Value::String("warning: already disconnected".to_owned()))
        }
    });

    let connections = Arc::clone(&connections_arc);
    io.add_method("poll_app_interface_signals", move |params: Params| {
        params.expect_no_params()?;
        println!("poll_app_interface_signals");

        Ok(Value::Array(
            connections
                .read()
                .iter()
                .filter_map(|(&port, connection_state_cell)| {
                    let signals_accumulated =
                        mem::take(&mut connection_state_cell.get()?.1.lock().signals_accumulated);
                    Some(json!({
                        "port": port,
                        "signals_accumulated": Value::Array(signals_accumulated),
                    }))
                })
                .collect(),
        ))
    });
}
