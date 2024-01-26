use std::{
    io::{self, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::atomic,
};

use parking_lot::Mutex;
use snafu::{ensure, ResultExt, Snafu};
use std::str;

use crate::{
    get_player_dir, player_config_exists, Player, CONDUCTOR_CONFIG_FILENAME, LAIR_PASSPHRASE,
    LAIR_STDERR_LOG_FILENAME, NEXT_ADMIN_PORT, PLAYERS,
};

#[derive(Debug, Snafu)]
pub(crate) enum ConfigurePlayerError {
    #[snafu(display("Could not create directory for at {}: {}", path.display(), source))]
    CreateDir { path: PathBuf, source: io::Error },
    #[snafu(display("Could not create lair-keystore config: {}", source))]
    CreateLairConfig { path: PathBuf, source: io::Error },
    #[snafu(display("Could not create config file at {}: {}", path.display(), source))]
    CreateConfig { path: PathBuf, source: io::Error },
    #[snafu(display("Ran out of possible admin ports"))]
    OutOfPorts,
    #[snafu(display("Could not write to config file at {}: {}", path.display(), source))]
    WriteConfig { path: PathBuf, source: io::Error },
    #[snafu(display("Player with ID {} has already been configured", id))]
    PlayerAlreadyConfigured { id: String },
}

pub(crate) fn configure_player(
    id: String,
    partial_config: String,
) -> Result<(), ConfigurePlayerError> {
    let player_dir = get_player_dir(&id);
    let config_path = player_dir.join(CONDUCTOR_CONFIG_FILENAME);

    std::fs::create_dir_all(&player_dir).with_context(|| CreateDir {
        path: config_path.clone(),
    })?;

    ensure!(!player_config_exists(&id), PlayerAlreadyConfigured { id });

    ensure!(
        NEXT_ADMIN_PORT.load(atomic::Ordering::SeqCst) != 0,
        OutOfPorts
    );
    let port = NEXT_ADMIN_PORT.fetch_add(1, atomic::Ordering::SeqCst);

    {
        let mut players_guard = PLAYERS.write();
        if players_guard.contains_key(&id) {
            return PlayerAlreadyConfigured { id }.fail();
        }
        players_guard.insert(
            id.clone(),
            Player {
                admin_port: port,
                processes: Mutex::default(),
            },
        );
    }

    let lair_stderr_log_path = player_dir.join(LAIR_STDERR_LOG_FILENAME);
    let mut lair = Command::new("lair-keystore")
        .current_dir(&player_dir)
        .env("RUST_BACKTRACE", "full")
        .args(["init", "--piped"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(
            std::fs::OpenOptions::new()
                .append(true)
                .create(true)
                .open(&lair_stderr_log_path)
                .context(CreateLairConfig {
                    path: lair_stderr_log_path.clone(),
                })?,
        )
        .spawn()
        .context(CreateLairConfig {
            path: lair_stderr_log_path.clone(),
        })?;
    if let Some(mut lair_stdin) = lair.stdin.take() {
        lair_stdin
            .write_all(LAIR_PASSPHRASE.as_bytes())
            .context(CreateLairConfig {
                path: lair_stderr_log_path.clone(),
            })?;
    }
    lair.wait().context(CreateLairConfig {
        path: lair_stderr_log_path.clone(),
    })?;

    // get connection url from lair config
    let lair_url = Command::new("lair-keystore")
        .current_dir(&player_dir)
        .env("RUST_BACKTRACE", "full")
        .arg("url")
        .stdout(Stdio::piped())
        .stderr(
            std::fs::OpenOptions::new()
                .append(true)
                .create(true)
                .open(&lair_stderr_log_path)
                .context(CreateLairConfig {
                    path: lair_stderr_log_path.clone(),
                })?,
        )
        .spawn()
        .context(CreateLairConfig {
            path: lair_stderr_log_path.clone(),
        })?;
    let connection_url_output = lair_url.wait_with_output().context(CreateLairConfig {
        path: lair_stderr_log_path.clone(),
    })?;
    let connection_url = std::str::from_utf8(connection_url_output.stdout.as_slice()).unwrap();

    let mut config_file = std::fs::File::create(&config_path).with_context(|| CreateConfig {
        path: config_path.clone(),
    })?;

    writeln!(
        config_file,
        "\
---
data_root_path: environment
keystore:
    type: lair_server
    connection_url: {}
admin_interfaces:
    - driver:
        type: websocket
        port: {}
{}",
        connection_url, port, partial_config
    )
    .with_context(|| WriteConfig {
        path: config_path.clone(),
    })?;

    println!(
        "wrote config for player {} to {}",
        id,
        config_path.display()
    );
    Ok(())
}
