//! trycp_server listens for remote commands issued by tryorama and does as requested
//! with a set of Holochain conductors that it manages on the local machine.

mod holochain_interface;
mod registrar;
mod rpc_util;

use holochain_interface::AppConnection;
use rpc_util::{internal_error, invalid_request};

use jsonrpc_core::{IoHandler, Params, Value};
use jsonrpc_ws_server::ServerBuilder;
use nix::{
    sys::signal::{self, Signal},
    unistd::Pid,
};
use serde_derive::Deserialize;
use serde_json::json;
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{self, BufRead, BufReader, Read, Write},
    mem,
    ops::Range,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{self, AtomicU32},
        Arc, Mutex, RwLock,
    },
};
use structopt::StructOpt;

// NOTE: don't change without also changing in crates/holochain/src/main.rs
const MAGIC_STRING: &str = "Conductor ready.";

const CONDUCTOR_CONFIG_FILENAME: &str = "conductor-config.yml";
const LAIR_STDERR_LOG_FILENAME: &str = "lair-stderr.txt";
const CONDUCTOR_STDOUT_LOG_FILENAME: &str = "conductor-stdout.txt";
const CONDUCTOR_STDERR_LOG_FILENAME: &str = "conductor-stderr.txt";
const PLAYERS_DIR_PATH: &str = "/tmp/trycp/players";
const DNA_DIR_PATH: &str = "/tmp/trycp/dnas";

#[derive(StructOpt)]
struct Cli {
    #[structopt(
        long,
        short,
        help = "The port to run the trycp server on",
        default_value = "9000"
    )]
    port: u16,

    #[structopt(
        long = "port-range",
        short = "r",
        help = "The port range to use for spawning new conductors (e.g. '9000-9150')"
    )]
    port_range_string: String,
    #[structopt(
        long,
        short = "c",
        help = "Allows the conductor to be remotely replaced"
    )]
    /// allow changing the conductor
    allow_replace_conductor: bool,

    #[structopt(long, short = "m", help = "Activate ability to runs as a manager")]
    /// activates manager mode
    manager: bool,

    #[structopt(
        long,
        short = "e",
        help = "Register with a manager (url + port, e.g. ws://final-exam:9000)"
    )]
    /// url of manager to register availability with
    register: Option<String>,

    #[structopt(
        long,
        short,
        help = "The host name to use when registering with a manager",
        default_value = "localhost"
    )]
    host: String,
}

type PortRange = Range<u16>;

fn parse_port_range(s: String) -> Result<PortRange, String> {
    let segments = s
        .split('-')
        .map(|seg| {
            seg.parse()
                .map_err(|e: std::num::ParseIntError| e.to_string())
        })
        .collect::<Result<Vec<u16>, String>>()?;
    match segments.as_slice() {
        &[lo, hi] => {
            if lo < hi {
                Ok(lo..hi)
            } else {
                Err("Port range must go from a lower port to a higher one.".into())
            }
        }
        _ => Err("Port range must be in the format 'xxxx-yyyy'".into()),
    }
}

struct TrycpServer {
    next_port: u16,
    port_range: PortRange,
    ports: HashMap<String, u16>,
}

impl TrycpServer {
    fn new(port_range: PortRange) -> Self {
        std::fs::create_dir_all(DNA_DIR_PATH)
            .map_err(|err| format!("{:?}", err))
            .expect("should create dna dir");
        TrycpServer {
            next_port: port_range.start,
            port_range,
            ports: HashMap::new(),
        }
    }

    fn acquire_port(&mut self, id: String) -> Result<u16, String> {
        if self.next_port < self.port_range.end {
            let port = self.next_port;
            self.next_port += 1;
            self.ports.insert(id, port);
            Ok(port)
        } else {
            Err(format!(
                "All available ports have been used up! Range: {:?}",
                self.port_range
            ))
        }
    }

    fn reset(&mut self) {
        self.next_port = self.port_range.start;
        self.ports.clear();

        if let Err(e) = std::fs::remove_dir_all(PLAYERS_DIR_PATH) {
            println!("error: failed to clear out players directory: {}", e);
        }
    }
}

fn get_player_dir(id: &str) -> PathBuf {
    Path::new(PLAYERS_DIR_PATH).join(id)
}

fn get_saved_dna_path(id: &str) -> PathBuf {
    Path::new(DNA_DIR_PATH).join(id)
}

fn get_downloaded_dna_path(url: &reqwest::Url) -> PathBuf {
    Path::new(DNA_DIR_PATH).join(url.path().to_string().replace("/", "").replace("%", "_"))
}

/// Tries to create a file, returning Ok(None) if a file already exists at path
fn try_create_file(path: &Path) -> Result<Option<File>, io::Error> {
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
    {
        Ok(file) => Ok(Some(file)),
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => Ok(None),
        Err(e) => Err(e),
    }
}

fn check_player_config_exists(id: &str) -> Result<(), jsonrpc_core::types::error::Error> {
    let file_path = get_player_dir(id).join(CONDUCTOR_CONFIG_FILENAME);
    if !file_path.is_file() {
        return Err(invalid_request(format!(
            "player config for {} not setup",
            id
        )));
    }
    Ok(())
}

fn main() {
    let args = Cli::from_args();
    let mut io = IoHandler::new();

    let conductor_port_range: PortRange =
        parse_port_range(args.port_range_string).expect("Invalid port range");

    let state: Arc<RwLock<TrycpServer>> =
        Arc::new(RwLock::new(TrycpServer::new(conductor_port_range)));
    let state_configure_player = state.clone();
    let state_reset = state.clone();
    let state_admin_interface_call = state.clone();

    struct Player {
        lair: Child,
        conductor: Child,
    }

    let players_arc: Arc<RwLock<HashMap<String, Player>>> = Arc::new(RwLock::new(HashMap::new()));
    let players_arc_shutdown = players_arc.clone();
    let players_arc_reset = players_arc.clone();
    let players_arc_startup = players_arc;

    if let Some(connection_uri) = args.register {
        registrar::register_with_remote(connection_uri, &args.host, args.port)
    }

    if args.manager {
        registrar::add_methods(&mut io);
    }

    io.add_method("ping", |params: Params| {
        params.expect_no_params()?;

        let output = Command::new("holochain")
            .arg("-V")
            .output()
            .map_err(|e| internal_error(format!("failed to execute `holochain -V`: {}", e)))?;
        let version = String::from_utf8(output.stdout).map_err(|e| {
            internal_error(format!("failed to parse holochain output as utf-8: {}", e))
        })?;

        Ok(Value::String(
            version
                .strip_prefix("holochain")
                .unwrap_or(&version)
                .trim()
                .to_string(),
        ))
    });

    // Given a base64-encoded DNA file, stores the DNA and returns the path at which it is stored.
    io.add_method("save_dna", move |params: Params| {
        #[derive(Deserialize)]
        struct SaveDnaParams {
            id: String,
            content_base64: String,
        }
        let SaveDnaParams { id, content_base64 } = params.parse()?;
        let file_path = get_saved_dna_path(&id);

        let new_file = try_create_file(&file_path).map_err(|e| {
            internal_error(format!(
                "unable to create file: {} {}",
                e,
                file_path.display()
            ))
        })?;

        if let Some(mut file) = new_file {
            let content = base64::decode(&content_base64)
                .map_err(|e| invalid_request(format!("failed to decode content_base64: {}", e)))?;

            file.write_all(&content).map_err(|e| {
                internal_error(format!(
                    "unable to write file: {} {}",
                    e,
                    file_path.display()
                ))
            })?;
        }

        let local_path = file_path.to_string_lossy();
        println!("dna for {} at {}", id, local_path);
        Ok(json!({ "path": local_path }))
    });

    // Given a DNA URL, ensures that the DNA is downloaded, and returns the path at which it is stored.
    io.add_method("download_dna", move |params: Params| {
        #[derive(Deserialize)]
        struct DownloadDnaParams {
            url: String,
        }
        let DownloadDnaParams { url: url_str } = params.parse()?;

        let url = reqwest::Url::parse(&url_str).map_err(|e| {
            invalid_request(format!("unable to parse url:{} got error: {}", url_str, e))
        })?;

        let file_path = get_downloaded_dna_path(&url);
        let new_file = try_create_file(&file_path).map_err(|e| {
            internal_error(format!(
                "unable to create file: {} {}",
                e,
                file_path.display()
            ))
        })?;

        if let Some(mut file) = new_file {
            println!("Downloading dna from {} ...", &url_str);
            let content: String = reqwest::get(url)
                .map_err(|e| {
                    internal_error(format!("error downloading dna: {:?} {:?}", e, url_str))
                })?
                .text()
                .map_err(|e| internal_error(format!("could not get text response: {}", e)))?;
            println!("Finished downloading dna from {}", url_str);

            file.write_all(content.as_bytes()).map_err(|e| {
                internal_error(format!(
                    "unable to write file: {} {}",
                    e,
                    file_path.display()
                ))
            })?;
        }

        let local_path = file_path.to_string_lossy();
        println!("dna for {} at {}", url_str, local_path);
        Ok(json!({ "path": local_path }))
    });

    io.add_method("configure_player", move |params: Params| {
        #[derive(Deserialize)]
        struct ConfigurePlayerParams {
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
        }
        let ConfigurePlayerParams { id, partial_config } = params.parse()?;

        let player_dir = get_player_dir(&id);
        let config_path = player_dir.join(CONDUCTOR_CONFIG_FILENAME);

        std::fs::create_dir_all(&player_dir).map_err(|e| {
            internal_error(format!(
                "failed to create directory ({}) for player: {:?}",
                player_dir.display(),
                e
            ))
        })?;

        let mut config_file = File::create(&config_path).map_err(|e| {
            internal_error(format!(
                "unable to create file: {:?} {}",
                e,
                config_path.display()
            ))
        })?;

        let port = state_configure_player
            .write()
            .unwrap()
            .acquire_port(id.clone())
            .map_err(internal_error)?;

        writeln!(
            config_file,
            "\
---
environment_path: environment
use_dangerous_test_keystore: false
keystore_path: keystore
passphrase_service:
  type: fromconfig
  passphrase: password
admin_interfaces:
  -
    driver:
      type: websocket
      port: {}
{}",
            port, partial_config
        )
        .map_err(|e| {
            internal_error(format!(
                "unable to write file: {:?} {}",
                e,
                config_path.display()
            ))
        })?;

        let response = format!(
            "wrote config for player {} to {}",
            id,
            config_path.display()
        );
        println!("player {}: {:?}", id, response);
        Ok(Value::String(response))
    });

    io.add_method("startup", move |params: Params| {
        #[derive(Deserialize)]
        struct StartupParams {
            id: String,
        }
        let StartupParams { id } = params.parse()?;

        check_player_config_exists(&id)?;
        let player_dir = get_player_dir(&id);

        println!("starting player with id: {}", id);

        let mut players = players_arc_startup.write().unwrap();
        if players.contains_key(&id) {
            return Err(invalid_request(format!("{} is already running", id)));
        };

        let mut lair = Command::new("lair-keystore")
            .current_dir(&player_dir)
            .arg("-d")
            .arg("keystore")
            .env("RUST_BACKTRACE", "full")
            .stdout(Stdio::piped())
            .stderr(
                fs::OpenOptions::new()
                    .append(true)
                    .create(true)
                    .open(player_dir.join(LAIR_STDERR_LOG_FILENAME))
                    .map_err(|e| internal_error(format!("failed to create log file: {:?}", e)))?,
            )
            .spawn()
            .map_err(|e| internal_error(format!("unable to startup keystore: {:?}", e)))?;

        // Wait until lair begins to output before starting conductor,
        // otherwise Holochain starts its own copy of lair that we can't manage.
        lair.stdout
            .take()
            .unwrap()
            .read_exact(&mut [0])
            .map_err(|e| {
                internal_error(format!("unable to check that keystore is started: {}", e))
            })?;

        let mut conductor = Command::new("holochain")
            .current_dir(&player_dir)
            .arg("-c")
            .arg(CONDUCTOR_CONFIG_FILENAME)
            .env("RUST_BACKTRACE", "full")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| internal_error(format!("unable to startup conductor: {:?}", e)))?;

        let conductor_stdout = conductor.stdout.take().unwrap();
        let conductor_stderr = conductor.stderr.take().unwrap();

        players.insert(id.clone(), Player { conductor, lair });
        std::mem::drop(players);

        let mut log_stdout = Command::new("tee")
            .arg(player_dir.join(CONDUCTOR_STDOUT_LOG_FILENAME))
            .arg("--append")
            .stdout(Stdio::piped())
            .stdin(conductor_stdout)
            .spawn()
            .unwrap();

        let _log_stderr = Command::new("tee")
            .arg(player_dir.join(CONDUCTOR_STDERR_LOG_FILENAME))
            .arg("--append")
            .stdin(conductor_stderr)
            .spawn()
            .unwrap();

        for line in BufReader::new(log_stdout.stdout.take().unwrap()).lines() {
            let line = line.unwrap();
            if line == MAGIC_STRING {
                println!("Encountered magic string");
                break;
            }
        }
        Ok(Value::String(format!("conductor started up for {}", id)))
    });

    io.add_method("shutdown", move |params: Params| {
        #[derive(Deserialize)]
        struct ShutdownParams {
            id: String,
            signal: Option<String>,
        }

        let ShutdownParams { id, signal } = params.parse()?;

        check_player_config_exists(&id)?;
        match players_arc_shutdown.write().unwrap().remove(&id) {
            None => {
                return Err(invalid_request(format!("no conductor spawned for {}", id)));
            }
            Some(mut player) => {
                let signal = match signal.as_deref() {
                    Some("SIGTERM") | None => Signal::SIGTERM,
                    Some("SIGKILL") => Signal::SIGKILL,
                    Some("SIGINT") => Signal::SIGINT,
                    Some(s) => return Err(invalid_request(format!("unrecognized signal: {}", s))),
                };
                println!("stopping player with id: {}", id);

                signal::kill(Pid::from_raw(player.lair.id() as i32), signal).map_err(|e| {
                    internal_error(format!(
                        "unable to shut down keystore for player {}: {:?}",
                        id, e
                    ))
                })?;
                player.lair.wait().unwrap();
                signal::kill(Pid::from_raw(player.conductor.id() as i32), signal).map_err(|e| {
                    internal_error(format!(
                        "unable to shut down conductor for player {}: {:?}",
                        id, e
                    ))
                })?;
                player.conductor.wait().unwrap();
            }
        }
        let response = format!("shut down conductor for {}", id);
        Ok(Value::String(response))
    });

    // Shuts down all running conductors.
    io.add_method("reset", move |params: Params| {
        params.expect_no_params()?;

        let mut players = {
            let mut players_lock = players_arc_reset.write().unwrap();
            let mut state_lock = state_reset.write().unwrap();
            state_lock.reset();
            std::mem::take(&mut *players_lock)
        };

        for (id, player) in players.iter_mut() {
            println!("force-killing player with id: {}", id);
            let _ = player.lair.kill(); // ignore any errors
            let _ = player.conductor.kill(); // ignore any errors
        }
        for player in players.values_mut() {
            player.lair.wait().unwrap(); // ignore any errors
            player.conductor.wait().unwrap(); // ignore any errors
        }

        Ok(Value::String("reset".into()))
    });

    io.add_method("admin_interface_call", move |params: Params| {
        #[derive(Deserialize)]
        struct AdminApiCallParams {
            id: String,
            message_base64: String,
        }
        let AdminApiCallParams { id, message_base64 } = params.parse()?;
        println!("admin_interface_call id: {:?}", id);

        let message_buf = base64::decode(&message_base64)
            .map_err(|e| invalid_request(format!("failed to decode message_base64: {}", e)))?;

        let maybe_port = state_admin_interface_call
            .read()
            .unwrap()
            .ports
            .get(&id)
            .cloned();
        let port = maybe_port.ok_or_else(|| {
            invalid_request(format!(
                "failed to call player admin interface: player not yet configured"
            ))
        })?;
        let response_buf = holochain_interface::remote_call(port, message_buf)?;
        Ok(Value::String(base64::encode(&response_buf)))
    });

    let app_interface_connections_arc: Arc<
        RwLock<HashMap<u16, (ws::Sender, Arc<Mutex<AppConnection>>)>>,
    > = Arc::default();

    let app_interface_connections = Arc::clone(&app_interface_connections_arc);
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

        let message_buf = base64::decode(&message_base64)
            .map_err(|e| invalid_request(format!("failed to decode message_base64: {}", e)))?;

        let (tx, rx) = crossbeam::channel::bounded(0);

        let app_interface_connections = Arc::clone(&app_interface_connections);
        holochain_interface::connect_app_interface(port, move |handle| {
            static NEXT_APP_INTERFACE_REQUEST_ID: AtomicU32 = AtomicU32::new(0);

            let mut responses_awaited = HashMap::new();

            let req_id = NEXT_APP_INTERFACE_REQUEST_ID
                .fetch_add(1, atomic::Ordering::Relaxed)
                .to_string();

            match handle.send(holochain_interface::request(req_id.clone(), message_buf)) {
                Ok(()) => assert!(responses_awaited.insert(req_id, tx).is_none()),
                Err(e) => tx.send(Err(e)).unwrap(),
            }
            let connection = Arc::new(Mutex::new(holochain_interface::AppConnection {
                signals_accumulated: Vec::new(),
                responses_awaited,
            }));
            let prev_connection = app_interface_connections
                .write()
                .unwrap()
                .insert(port, (handle, Arc::clone(&connection)));
            assert!(prev_connection.is_none());
            connection
        });

        match rx.recv().unwrap() {
            Ok(string) => Ok(Value::String(string)),
            Err(e) => Err(internal_error(format!(
                "failed to send message along app interface: {}",
                e
            ))),
        }
    });

    let app_interface_connections = app_interface_connections_arc;
    io.add_method("poll_app_interface_signals", move |params: Params| {
        #[derive(Deserialize)]
        struct PollSignalsParams {
            port: u16,
        }
        let PollSignalsParams { port } = params.parse()?;
        println!("poll_app_interface_signals port: {:?}", port);

        if !app_interface_connections
            .read()
            .unwrap()
            .contains_key(&port)
        {
            let app_interface_connections = Arc::clone(&app_interface_connections);
            holochain_interface::connect_app_interface(port, move |handle| {
                let connection = Arc::new(Mutex::new(holochain_interface::AppConnection {
                    signals_accumulated: Vec::new(),
                    responses_awaited: HashMap::new(),
                }));
                let prev_connection = app_interface_connections
                    .write()
                    .unwrap()
                    .insert(port, (handle, Arc::clone(&connection)));
                assert!(prev_connection.is_none());
                connection
            });
            return Ok(Value::Array(Vec::new()));
        }

        Ok(Value::Array(mem::take(
            &mut app_interface_connections
                .read()
                .unwrap()
                .get(&port)
                .unwrap()
                .1
                .lock()
                .unwrap()
                .signals_accumulated,
        )))
    });

    let allow_replace_conductor = args.allow_replace_conductor;
    io.add_method("replace_conductor", move |params: Params| {
        /// very dangerous, runs whatever strings come in from the internet directly in bash
        fn os_eval(arbitrary_command: &str) -> String {
            println!("running cmd {}", arbitrary_command);
            match Command::new("bash")
                .args(&["-c", arbitrary_command])
                .output()
            {
                Ok(output) => {
                    let response = if output.status.success() {
                        &output.stdout
                    } else {
                        &output.stderr
                    };
                    String::from_utf8_lossy(response).trim_end().to_string()
                }
                Err(err) => format!("cmd err: {:?}", err),
            }
        }

        #[derive(Deserialize)]
        struct ReplaceConductorParams {
            repo: String,
            tag: String,
            file_name: String,
        }
        if allow_replace_conductor {
            let ReplaceConductorParams {
                repo,
                tag,
                file_name,
            } = params.parse()?;
            Ok(Value::String(os_eval(&format!(
                "curl -L -k https://github.com/holochain/{}/releases/download/{}/{} -o holochain.tar.gz \
                && tar -xzvf holochain.tar.gz \
                && mv holochain /holochain/.cargo/bin/holochain \
                && rm holochain.tar.gz",
                repo, tag, file_name
            ))))
        } else {
            println!("replace not allowed (-c to enable)");
            Ok(Value::String("replace not allowed".to_string()))
        }
    });

    let server = ServerBuilder::new(io)
        .start(&format!("0.0.0.0:{}", args.port).parse().unwrap())
        .expect("server should start");

    println!("waiting for connections on port {}", args.port);

    server.wait().expect("server should wait");
}
