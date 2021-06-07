use std::{
    io::{self, Write},
    path::PathBuf,
    sync::atomic,
};

use parking_lot::Mutex;
use snafu::{ensure, ResultExt, Snafu};

use crate::{
    get_player_dir, player_config_exists, Player, CONDUCTOR_CONFIG_FILENAME, NEXT_ADMIN_PORT,
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
    #[snafu(display("Could not write to config file at {}: {}", path.display(), source))]
    WriteConfig { path: PathBuf, source: io::Error },
    #[snafu(display("Player with ID {} has already been configured", id))]
    PlayerAlreadyConfigured { id: String },
}

pub(crate) fn configure_player(
    id: String,
    partial_config: String,
    lair_shim: Option<u16>
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

    let mut config_file = std::fs::File::create(&config_path).with_context(|| CreateConfig {
        path: config_path.clone(),
    })?;

    let keystore_path = if lair_shim.is_some() { "shim" } else { "keystore" };

    writeln!(
        config_file,
        "\
---
environment_path: environment
use_dangerous_test_keystore: false
keystore_path: {}
passphrase_service:
    type: fromconfig
    passphrase: password
admin_interfaces:
    - driver:
        type: websocket
        port: {}
{}",
        keystore_path, port, partial_config
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
