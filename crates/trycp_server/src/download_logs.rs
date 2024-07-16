use crate::{
    get_player_dir, player_config_exists, CONDUCTOR_STDERR_LOG_FILENAME,
    CONDUCTOR_STDOUT_LOG_FILENAME, LAIR_STDERR_LOG_FILENAME,
};
use snafu::{ResultExt, Snafu};
use trycp_api::DownloadLogsResponse;

#[derive(Debug, Snafu)]
pub(crate) enum DownloadLogsError {
    #[snafu(display("No player with this ID is configured {}", id))]
    PlayerNotConfigured { id: String },
    #[snafu(display("Could not read lair stderr log for player with ID {}: {}", id, source))]
    LairStdErr { id: String, source: std::io::Error },
    #[snafu(display(
        "Could not read holochain stdout log for player with ID {}: {}",
        id,
        source
    ))]
    HolochainStdout { id: String, source: std::io::Error },
    #[snafu(display(
        "Could not read holochain stderr log for player with ID {}: {}",
        id,
        source
    ))]
    HolochainStderr { id: String, source: std::io::Error },
}

pub(crate) fn download_logs(id: String) -> Result<DownloadLogsResponse, DownloadLogsError> {
    if !player_config_exists(&id) {
        return Err(DownloadLogsError::PlayerNotConfigured { id });
    }

    let player_dir = get_player_dir(&id);

    let lair_stderr = player_dir.join(LAIR_STDERR_LOG_FILENAME);
    let lair_stderr =
        std::fs::read(&lair_stderr).context(LairStdErr { id: id.clone() })?;

    let conductor_stdout = player_dir.join(CONDUCTOR_STDOUT_LOG_FILENAME);
    let conductor_stdout =
        std::fs::read(&conductor_stdout).context(HolochainStdout { id: id.clone() })?;

    let conductor_stderr = player_dir.join(CONDUCTOR_STDERR_LOG_FILENAME);
    let conductor_stderr =
        std::fs::read(&conductor_stderr).context(HolochainStderr { id })?;

    Ok(DownloadLogsResponse {
        lair_stderr,
        conductor_stdout,
        conductor_stderr,
    })
}
