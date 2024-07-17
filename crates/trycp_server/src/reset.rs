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
    let (players, app_connections, admin_connections) = {
        let mut players_guard = PLAYERS.write();
        let mut app_connections_guard =
            futures::executor::block_on(app_interface::APP_CONNECTIONS.lock());
        let mut admin_connections_guard =
            futures::executor::block_on(crate::admin_call::ADMIN_CONNECTIONS.lock());
        NEXT_ADMIN_PORT.store(FIRST_ADMIN_PORT, atomic::Ordering::SeqCst);
        match std::fs::remove_dir_all(PLAYERS_DIR_PATH) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(RemoveDir.into_error(e)),
        }
        (
            std::mem::take(&mut *players_guard),
            std::mem::take(&mut *app_connections_guard),
            std::mem::take(&mut *admin_connections_guard),
        )
    };

    for (port, connection) in app_connections {
        if let Err(e) = futures::executor::block_on(app_interface::disconnect(connection)) {
            println!(
                "warn: failed to disconnect app interface at port {}: {}",
                port, e
            );
        }
    }

    for (_, connection) in admin_connections {
        if let Err(e) = futures::executor::block_on(crate::admin_call::disconnect(connection)) {
            println!("warn: failed to disconnect admin interface: {}", e);
        }
    }

    for (id, mut player) in players {
        if let Err(e) = kill_player(player.processes.get_mut(), &id, Signal::SIGKILL) {
            println!("warn: failed to kill player {:?}: {}", id, e);
        }
    }

    Ok(())
}
