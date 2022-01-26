use nix::sys::signal::Signal;
use snafu::{ensure, Snafu};

use crate::{kill_player, player_config_exists, KillError, PLAYERS};

#[derive(Debug, Snafu)]
pub(crate) enum ShutdownError {
    #[snafu(display("Could not find a configuration for player with ID {:?}", id))]
    PlayerNotConfigured { id: String },
    #[snafu(display("The specified signal {:?} is invalid", signal))]
    UnrecognizedSignal { signal: String },
    #[snafu(context(false))]
    Kill { source: KillError },
}

pub(crate) fn shutdown(id: String, signal: Option<String>) -> Result<(), ShutdownError> {
    ensure!(player_config_exists(&id), PlayerNotConfigured { id });

    let signal = match signal.as_deref() {
        Some("SIGTERM") | None => Signal::SIGTERM,
        Some("SIGKILL") => Signal::SIGKILL,
        Some("SIGINT") => Signal::SIGINT,
        Some(s) => {
            return Err(ShutdownError::UnrecognizedSignal {
                signal: s.to_owned(),
            })
        }
    };

    let players_guard = PLAYERS.read();
    let processes_lock = match players_guard.get(&id) {
        Some(player) => &player.processes,
        None => return Ok(()),
    };

    let mut player_cell = processes_lock.lock();

    kill_player(&mut player_cell, &id, signal)?;

    Ok(())
}
