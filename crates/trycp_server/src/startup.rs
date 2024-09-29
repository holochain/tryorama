use crate::{
    get_player_dir, PlayerProcesses, CONDUCTOR_CONFIG_FILENAME, CONDUCTOR_MAGIC_STRING,
    CONDUCTOR_STDERR_LOG_FILENAME, CONDUCTOR_STDOUT_LOG_FILENAME, LAIR_PASSPHRASE, PLAYERS,
};
use snafu::{OptionExt, ResultExt, Snafu};
use std::io::Lines;
use std::process::ChildStdout;
use std::{
    io::{self, BufRead, BufReader, Write},
    path::PathBuf,
    process::{Command, Stdio},
};

#[derive(Debug, Snafu)]
pub enum Error {
    #[snafu(display("Could not find a configuration for player with ID {:?}", id))]
    PlayerNotConfigured { id: String },
    #[snafu(display("Could not spawn lair-keystore: {}", source))]
    SpawnLair { source: io::Error },
    #[snafu(display("Could not spawn holochain: {}", source))]
    SpawnHolochain { source: io::Error },
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

        if processes.is_some() {
            return Ok(());
        }

        println!("starting player with id: {}", id);

        let mut conductor = Command::new("holochain")
            .current_dir(&player_dir)
            .arg("--piped")
            .arg("-c")
            .arg(CONDUCTOR_CONFIG_FILENAME)
            // Disable ANSI color codes in Holochain output, which should be set any time the output
            // is being written to a file.
            // See https://docs.rs/tracing-subscriber/0.3.18/tracing_subscriber/fmt/struct.Layer.html#method.with_ansi
            .env("NO_COLOR", "1")
            .env("RUST_BACKTRACE", "full")
            .env("RUST_LOG", rust_log)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context(SpawnHolochain)?;

        if let Some(mut holochain_stdin) = conductor.stdin.take() {
            holochain_stdin
                .write_all(LAIR_PASSPHRASE.as_bytes())
                .context(SpawnLair)?;
        }

        conductor_stdout = conductor.stdout.take().unwrap();
        conductor_stderr = conductor.stderr.take().unwrap();

        *processes = Some(PlayerProcesses {
            holochain: conductor,
        });
    }

    stream_output_with_ready(
        conductor_stdout,
        CONDUCTOR_MAGIC_STRING,
        Some(player_dir.join(CONDUCTOR_STDOUT_LOG_FILENAME)),
        format!("holochain({id})"),
    )
    .context(CheckHolochainReady)?;

    stream_output(
        BufReader::new(conductor_stderr).lines(),
        Some(player_dir.join(CONDUCTOR_STDERR_LOG_FILENAME)),
        format!("holochain({id})"),
    );

    println!("conductor started up for {}", id);
    Ok(())
}

fn open_log_file(path: PathBuf) -> io::Result<std::fs::File> {
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
}

fn stream_output_with_ready(
    stdout: ChildStdout,
    ready_line: &str,
    into_file: Option<PathBuf>,
    context: String,
) -> io::Result<()> {
    let mut f = into_file.clone().map(open_log_file).transpose()?;

    let mut reader = BufReader::new(stdout).lines();
    for line in &mut reader {
        let line = line?;
        if let Some(f) = &mut f {
            writeln!(f, "{}: {}", context, line)?;
        }
        println!("{context}: {line}");
        if line == ready_line {
            if let Some(f) = f {
                drop(f);
            }
            stream_output(reader, into_file, context);
            break;
        }
    }

    Ok(())
}

fn stream_output<B: BufRead + Send + 'static>(
    mut reader: Lines<B>,
    into_file: Option<PathBuf>,
    context: String,
) {
    tokio::task::spawn_blocking(move || {
        let mut f = into_file.clone().map(open_log_file).transpose().unwrap();
        while let Some(Ok(line)) = reader.next() {
            if let Some(f) = &mut f {
                writeln!(f, "{}: {}", context, line).unwrap();
            }
            println!("{context}: {line}");
        }
    });
}
