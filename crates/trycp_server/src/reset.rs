use std::{io, sync::atomic};

use nix::sys::signal::Signal;
use snafu::{IntoError, Snafu};

use crate::{
    app_interface, kill_player, FIRST_ADMIN_PORT, NEXT_ADMIN_PORT, PLAYERS, PLAYERS_DIR_PATH,
};

#[derive(Debug, Snafu)]
pub(crate) enum ResetError {
    #[snafu(display(
        "Could not clear out players directory at {}: {}",
        PLAYERS_DIR_PATH,
        source
    ))]
    RemoveDir { source: io::Error },
}

pub(crate) fn reset() -> Result<(), ResetError> {
    let (players, connections) = {
        let mut players_guard = PLAYERS.write();
        let mut connections_guard = futures::executor::block_on(app_interface::CONNECTIONS.lock());
        NEXT_ADMIN_PORT.store(FIRST_ADMIN_PORT, atomic::Ordering::SeqCst);
        match std::fs::remove_dir_all(PLAYERS_DIR_PATH) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(RemoveDir.into_error(e)),
        }
        (
            std::mem::take(&mut *players_guard),
            std::mem::take(&mut *connections_guard),
        )
    };

    for (port, connection) in connections {
        if let Err(e) = futures::executor::block_on(app_interface::disconnect(connection)) {
            println!(
                "warn: failed to disconnect app interface at port {}: {}",
                port, e
            );
        }
    }

    for (id, mut player) in players {
        if let Err(e) = kill_player(player.processes.get_mut(), &id, Signal::SIGKILL) {
            println!("warn: failed to kill player {:?}: {}", id, e);
        }
    }

    Ok(())
}
