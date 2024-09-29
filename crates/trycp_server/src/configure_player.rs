use std::{io, net::TcpListener, path::PathBuf};

use parking_lot::Mutex;
use snafu::{ensure, ResultExt, Snafu};
use std::str;

use crate::{
    get_player_dir, player_config_exists, Player, ADMIN_PORT_RANGE, CONDUCTOR_CONFIG_FILENAME,
    PLAYERS,
};

#[derive(Debug, Snafu)]
pub(crate) enum ConfigurePlayerError {
    #[snafu(display("Could not create directory for at {}: {}", path.display(), source))]
    CreateDir { path: PathBuf, source: io::Error },
    #[snafu(display("Could not create config file at {}: {}", path.display(), source))]
    CreateConfig { path: PathBuf, source: io::Error },
    #[snafu(display("Ran out of possible admin ports"))]
    OutOfPorts,
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

    let mut admin_port = 0;
    for port in ADMIN_PORT_RANGE {
        let listener = TcpListener::bind(format!("localhost:{port}"));
        if let Ok(p) = listener {
            admin_port = p.local_addr().unwrap().port();
            break;
        }
    }
    ensure!(admin_port != 0, OutOfPorts);
    println!("Admin port {admin_port} assigned to player.");

    {
        let mut players_guard = PLAYERS.write();
        if players_guard.contains_key(&id) {
            return PlayerAlreadyConfigured { id }.fail();
        }
        players_guard.insert(
            id.clone(),
            Player {
                admin_port,
                processes: Mutex::default(),
            },
        );
    }

    let config = format!(
        "\
---
data_root_path: environment
keystore:
    type: lair_server_in_proc
admin_interfaces:
    - driver:
        type: websocket
        port: {}
        allowed_origins: \"*\"
{}",
        admin_port, partial_config
    );

    std::fs::write(config_path.clone(), config.clone()).with_context(|| CreateConfig {
        path: config_path.clone(),
    })?;

    println!(
        "wrote config for player {} to {}",
        id,
        config_path.display()
    );
    Ok(())
}
