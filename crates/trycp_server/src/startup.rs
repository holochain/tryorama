use std::{
    io::{self, BufRead, BufReader, Read},
    path::PathBuf,
    process::{Command, Stdio},
};

use snafu::{OptionExt, ResultExt, Snafu};

use crate::{
    get_player_dir, PlayerProcesses, CONDUCTOR_CONFIG_FILENAME, CONDUCTOR_STDERR_LOG_FILENAME,
    CONDUCTOR_STDOUT_LOG_FILENAME, LAIR_STDERR_LOG_FILENAME, MAGIC_STRING, PLAYERS,
};

#[derive(Debug, Snafu)]
pub enum Error {
    #[snafu(display("Could not find a configuration for player with ID {:?}", id))]
    PlayerNotConfigured { id: String },
    #[snafu(display("Could not create log file at {} for lair-keystore's stdout: {}", path.display(), source))]
    CreateLairStdoutFile { path: PathBuf, source: io::Error },
    #[snafu(display("Could not spawn lair-keystore: {}", source))]
    SpawnLair { source: io::Error },
    #[snafu(display(
        "Could not check lair-keystore's output to confirm that it's ready: {}",
        source
    ))]
    CheckLairReady { source: io::Error },
    #[snafu(display("Could not spawn holochain: {}", source))]
    SpawnHolochain { source: io::Error },
    #[snafu(display("Could not spawn tee: {}", source))]
    SpawnTee { source: io::Error },
    #[snafu(display(
        "Could not check holochain's output to confirm that it's ready: {}",
        source
    ))]
    CheckHolochainReady { source: io::Error },
}

pub fn startup(id: String, log_level: Option<String>) -> Result<(), Error> {
    let rust_log = log_level.unwrap_or_else(|| "error".to_string());

    let player_dir = get_player_dir(&id);

    let conductor_stdout;
    let conductor_stderr;
    {
        let players = PLAYERS.read();
        let player = players
            .get(&id)
            .context(PlayerNotConfigured { id: id.clone() })?;

        let mut processes = player.processes.lock();

        println!("starting player with id: {}", id);

        let lair_stdout_log_path = player_dir.join(LAIR_STDERR_LOG_FILENAME);
        let mut lair = Command::new("lair-keystore")
            .current_dir(&player_dir)
            .arg("-d")
            .arg("keystore")
            .env("RUST_BACKTRACE", "full")
            .stdout(Stdio::piped())
            .stderr(
                std::fs::OpenOptions::new()
                    .append(true)
                    .create(true)
                    .open(&lair_stdout_log_path)
                    .context(CreateLairStdoutFile {
                        path: lair_stdout_log_path,
                    })?,
            )
            .spawn()
            .context(SpawnLair)?;

        // Wait until lair begins to output before starting conductor,
        // otherwise Holochain starts its own copy of lair that we can't manage.
        lair.stdout
            .as_mut()
            .unwrap()
            .read_exact(&mut [0])
            .context(CheckLairReady)?;

        let mut conductor = Command::new("holochain")
            .current_dir(&player_dir)
            .arg("-c")
            .arg(CONDUCTOR_CONFIG_FILENAME)
            .env("RUST_BACKTRACE", "full")
            .env("RUST_LOG", rust_log)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context(SpawnHolochain)?;

        conductor_stdout = conductor.stdout.take().unwrap();
        conductor_stderr = conductor.stderr.take().unwrap();

        *processes = Some(PlayerProcesses {
            holochain: conductor,
            lair,
        });
    }

    let mut log_stdout = Command::new("tee")
        .arg(player_dir.join(CONDUCTOR_STDOUT_LOG_FILENAME))
        .arg("--append")
        .stdout(Stdio::piped())
        .stdin(conductor_stdout)
        .spawn()
        .context(SpawnTee)?;

    let _log_stderr = Command::new("tee")
        .arg(player_dir.join(CONDUCTOR_STDERR_LOG_FILENAME))
        .arg("--append")
        .stdin(conductor_stderr)
        .spawn()
        .context(SpawnTee)?;

    for line in BufReader::new(log_stdout.stdout.take().unwrap()).lines() {
        let line = line.context(CheckHolochainReady)?;
        if line == MAGIC_STRING {
            println!("Encountered magic string");
            break;
        }
    }

    println!("conductor started up for {}", id);
    Ok(())
}
