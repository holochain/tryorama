//! Functionality associated with "manager mode"

use std::sync::{Arc, RwLock};

use in_stream::{
    InStream, InStreamTcp, InStreamWss, IoErrorExt, JsonRpcRequest, JsonRpcResponse,
    TcpConnectConfig, WsFrame, WssConnectConfig,
};
use jsonrpc_core::{IoHandler, Params, Value};
use reqwest::Url;
use serde_derive::{Deserialize, Serialize};
use url2::Url2;

use crate::rpc_util::invalid_request;

// info about trycp_servers so that we can in the future request
// characteristics and set up tests based on the nodes capacities
#[derive(Serialize, Debug, PartialEq)]
struct ServerInfo {
    url: String,
    ram: usize, // MB of ram
}

#[derive(Serialize, Debug, PartialEq)]
pub struct ServerList {
    servers: Vec<ServerInfo>,
}

impl ServerList {
    pub fn new() -> Self {
        ServerList {
            servers: Vec::new(),
        }
    }
    fn pop(&mut self) -> Option<ServerInfo> {
        self.servers.pop()
    }
    fn remove(&mut self, url: &str) {
        self.servers.retain(|i| i.url != url);
    }
    fn insert(&mut self, info: ServerInfo) {
        self.remove(&info.url);
        self.servers.push(info);
    }
    fn len(&self) -> usize {
        self.servers.len()
    }
}

pub fn register_with_remote(connection_uri: String, local_hostname: &str, local_port: u16) {
    let result = send_json_rpc(
        connection_uri.clone(),
        "register",
        json!({ "url": format!("ws://{}:{}", local_hostname, local_port) }),
    );
    if let Err(e) = result {
        println!(
            "error {:?} encountered while registering with {}",
            e, connection_uri
        );
        return;
    };

    println!("{}", result.unwrap());
}

pub fn add_methods(io: &mut IoHandler) {
    // if we are acting as a manager add the "register" and "request" commands

    let registered_arc = Arc::new(RwLock::new(ServerList::new()));

    let registered = Arc::clone(&registered_arc);
    // command for other trycp server to register themselves as available
    io.add_method("register", move |params: Params| {
        #[derive(Deserialize)]
        struct RegisterParams {
            url: String,
            ram: usize,
        }
        let params: RegisterParams = params.parse()?;
        // Validate the URL
        let _url = Url::parse(&params.url).map_err(|e| {
            invalid_request(format!(
                "unable to parse url:{} got error: {}",
                params.url, e
            ))
        })?;

        registered.write().unwrap().insert(ServerInfo {
            url: params.url.clone(),
            ram: params.ram,
        });
        Ok(Value::String(format!("registered {}", params.url)))
    });

    // Returns the specified number of available trycp_servers and marks them unavailable
    io.add_method("request", move |params: Params| {
        #[derive(Deserialize)]
        struct RequestParams {
            count: usize,
        }
        let RequestParams { mut count } = params.parse()?;
        let mut endpoints: Vec<ServerInfo> = Vec::new();
        let mut registered = registered_arc.write().unwrap();

        // build up a list of confirmed available endpoints
        // TODO make confirmation happen asynchronously so it's faster
        if registered.len() >= count {
            while count > 0 {
                match registered.pop() {
                    Some(info) => {
                        if check_url(&info.url) {
                            endpoints.push(info)
                        }
                    }
                    None => break,
                }
                count -= 1;
            }
        }
        if count > 0 {
            // add any nodes that got taken off the registered list that are still valid back on
            for info in endpoints {
                registered.insert(info);
            }
            Ok(json!({"error": "insufficient endpoints available" }))
        } else {
            Ok(json!({ "endpoints": endpoints }))
        }
    });
}

fn check_url(url: &str) -> bool {
    // send reset to Url to confirm that it's working, and ready.
    let result = send_json_rpc(url, "reset", json!({}));

    // if there is a successful reset, the the rpc call should return "reset"
    match result {
        Ok(r) => r == "reset",
        _ => false,
    }
}

fn send_json_rpc<S: Into<String>>(
    uri: S,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let uri: String = uri.into();
    let connection_uri = Url2::try_parse(uri.clone())
        .map_err(|e| format!("unable to parse url:{} got error: {}", uri, e))?;
    //        let config = WssConnectConfig::new(TlsConnectConfig::new(TcpConnectConfig::default()));
    let config = WssConnectConfig::new(TcpConnectConfig::default());
    let mut connection: InStreamWss<InStreamTcp> =
        InStreamWss::connect(&connection_uri, config).map_err(|e| format!("{}", e))?;

    connection
        .write(
            serde_json::to_vec(&JsonRpcRequest::new("1", method, params))
                .unwrap()
                .into(),
        )
        .map_err(|e| format!("{}", e))?;
    connection.flush().map_err(|e| format!("{}", e))?;

    let mut res = WsFrame::default();
    while let Err(e) = connection.read(&mut res) {
        if e.would_block() {
            std::thread::sleep(std::time::Duration::from_millis(1))
        } else {
            return Err(format!("{:?}", e));
        }
    }

    let res: JsonRpcResponse = serde_json::from_slice(res.as_bytes()).unwrap();
    if let Some(err) = res.error {
        Err(format!("{:?}", err))
    } else {
        Ok(res.result.unwrap())
    }
}
