#![deny(missing_docs)]
//! Protocol for trycp_server websocket messages.

/// Requests must include a message id.
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RequestWrapper {
    /// The message id.
    pub id: u64,

    /// The request content.
    pub request: Request,
}

/// Trycp server requests.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
#[serde(tag = "type")]
pub enum Request {
    /// Given a DNA file, stores the DNA and returns the path at which it is stored.
    SaveDna {
        /// This is actually the dna filename.
        id: String,

        /// Content.
        #[serde(with = "serde_bytes")]
        content: Vec<u8>,
    },

    /// Given a DNA URL, ensures that the DNA is downloaded and returns the path at which it is stored.
    DownloadDna {
        /// Url.
        url: String,
    },

    /// Set up a player.
    ConfigurePlayer {
        /// The player id.
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

    /// Start a conductor.
    Startup {
        /// The conductor id.
        id: String,

        /// The log level of the conductor.
        log_level: Option<String>,
    },

    /// Shut down a conductor.
    Shutdown {
        /// The id of the conductor to shut down.
        id: String,

        /// The signal with which to shut down the conductor.
        signal: Option<String>,
    },

    /// Shuts down all running conductors.
    Reset,

    /// Make an admin request.
    CallAdminInterface {
        /// The conductor id.
        id: String,

        /// The request.
        #[serde(with = "serde_bytes")]
        message: Vec<u8>,
    },

    /// Hook up an app interface.
    ConnectAppInterface {
        /// Token.
        token: Vec<u8>,

        /// Port.
        port: u16,
    },

    /// Disconnect an app interface.
    DisconnectAppInterface {
        /// Port.
        port: u16,
    },

    /// Make an ap request.
    CallAppInterface {
        /// Port.
        port: u16,

        /// The request.
        #[serde(with = "serde_bytes")]
        message: Vec<u8>,
    },
}

/// Message response types.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
#[serde(untagged)]
pub enum MessageResponse {
    /// Unit response.
    Null,

    /// Encoded response.
    Bytes(Vec<u8>),
}

impl MessageResponse {
    /// Convert into bytes.
    pub fn into_bytes(self) -> Vec<u8> {
        match self {
            Self::Null => Vec::new(),
            Self::Bytes(v) => v,
        }
    }
}

/// A Message from a trycp_server.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
#[serde(tag = "type")]
pub enum MessageToClient {
    /// A signal emitted by a conductor.
    Signal {
        /// The app port from which this signal was emitted.
        port: u16,

        /// The content of the signal.
        data: Vec<u8>,
    },

    /// A response to a trycp server request.
    Response {
        /// request message id.
        id: u64,

        /// message content.
        response: std::result::Result<MessageResponse, String>,
    },
}
