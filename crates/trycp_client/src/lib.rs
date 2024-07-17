#![deny(missing_docs)]
//! Trycp client.

use futures::{sink::SinkExt, stream::StreamExt};
use std::collections::HashMap;
use std::io::Result;
use std::sync::Arc;
use tokio_tungstenite::{
    tungstenite::{client::IntoClientRequest, Message},
    *,
};
pub use trycp_api::Request;
use trycp_api::*;

type WsCore = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;
type WsSink = futures::stream::SplitSink<WsCore, Message>;
type Ws = Arc<tokio::sync::Mutex<WsSink>>;

/// Signal emitted from a conductor.
pub struct Signal {
    /// The app port from which this signal was emitted.
    pub port: u16,

    /// The content of the signal.
    pub data: Vec<u8>,
}

/// Trycp client recv.
pub struct SignalRecv(tokio::sync::mpsc::Receiver<Signal>);

impl SignalRecv {
    /// Receive.
    pub async fn recv(&mut self) -> Option<Signal> {
        self.0.recv().await
    }
}

/// Trycp client.
pub struct TrycpClient {
    ws: Ws,
    pend:
        Arc<std::sync::Mutex<HashMap<u64, tokio::sync::oneshot::Sender<Result<MessageResponse>>>>>,
    recv_task: tokio::task::JoinHandle<()>,
}

impl Drop for TrycpClient {
    fn drop(&mut self) {
        let ws = self.ws.clone();
        tokio::task::spawn(async move {
            let _ = ws.lock().await.close().await;
        });
        self.recv_task.abort();
    }
}

impl TrycpClient {
    /// Connect to a remote trycp server.
    pub async fn connect<R>(request: R) -> Result<(Self, SignalRecv)>
    where
        R: IntoClientRequest + Unpin,
    {
        let (w, _) = tokio_tungstenite::connect_async(request)
            .await
            .map_err(std::io::Error::other)?;

        let (sink, mut stream) = w.split();

        let map: HashMap<u64, tokio::sync::oneshot::Sender<Result<MessageResponse>>> =
            HashMap::new();
        let pend = Arc::new(std::sync::Mutex::new(map));

        let (recv_send, recv_recv) = tokio::sync::mpsc::channel(32);

        let ws = Arc::new(tokio::sync::Mutex::new(sink));
        let ws2 = ws.clone();
        let pend2 = pend.clone();
        let recv_task = tokio::task::spawn(async move {
            while let Some(Ok(msg)) = stream.next().await {
                let msg = match msg {
                    Message::Close(close_msg) => {
                        eprintln!(
                            "Received websocket close from TryCP server: {}",
                            close_msg.map(|f| f.reason).unwrap_or("No reason".into())
                        );
                        break;
                    }
                    Message::Ping(p) => {
                        ws2.lock().await.send(Message::Pong(p)).await.unwrap();
                        continue;
                    }
                    Message::Pong(_) => {
                        continue;
                    }
                    Message::Binary(msg) => msg,
                    _ => {
                        panic!("Unexpected message from TryCP server: {:?}", msg);
                    }
                };
                let msg: MessageToClient = rmp_serde::from_slice(&msg).unwrap();

                match msg {
                    MessageToClient::Signal { port, data } => {
                        recv_send.send(Signal { port, data }).await.unwrap();
                    }
                    MessageToClient::Response { id, response } => {
                        if let Some(resp) = pend2.lock().unwrap().remove(&id) {
                            let _ = resp.send(response.map_err(std::io::Error::other));
                        }
                    }
                }
            }
        });

        Ok((
            Self {
                ws,
                pend,
                recv_task,
            },
            SignalRecv(recv_recv),
        ))
    }

    /// Make a request of the trycp server.
    pub async fn request(
        &self,
        request: Request,
        timeout: std::time::Duration,
    ) -> Result<MessageResponse> {
        static RID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let mid = RID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        let (s, r) = tokio::sync::oneshot::channel();

        self.pend.lock().unwrap().insert(mid, s);

        let pend = self.pend.clone();
        tokio::task::spawn(async move {
            tokio::time::sleep(timeout).await;
            pend.lock().unwrap().remove(&mid);
        });

        let request = RequestWrapper { id: mid, request };

        let request = rmp_serde::to_vec_named(&request).map_err(std::io::Error::other)?;

        self.ws
            .lock()
            .await
            .send(Message::Binary(request))
            .await
            .map_err(std::io::Error::other)?;

        r.await.map_err(|_| std::io::Error::other("Timeout"))?
    }
}
