use std::path::{Path, PathBuf};

use snafu::{ResultExt, Snafu};
use std::{
    fs,
    io::{self, Write},
};

use crate::DNA_DIR_PATH;

#[derive(Debug, Snafu)]
pub enum Error {
    #[snafu(display("Could not create DNA directory at {}: {}", DNA_DIR_PATH, source))]
    CreateDnaDirectory { source: io::Error },
    #[snafu(display("Could not create file at {}: {}", path.display(), source))]
    CreateFile { path: PathBuf, source: io::Error },
    #[snafu(display("Could not write {} bytes to file at {}: {}", num_bytes, path.display(), source))]
    WriteFile {
        num_bytes: usize,
        path: PathBuf,
        source: io::Error,
    },
}

pub fn save_dna(id: String, content: Vec<u8>) -> Result<String, Error> {
    let path = Path::new(DNA_DIR_PATH).join(id);

    let path_string = path
        .to_str()
        .expect("path constructed from UTF-8 filename and UTF-8 directory should be valid UTF-8")
        .to_owned();

    fs::create_dir_all(Path::new(DNA_DIR_PATH)).context(CreateDnaDirectory)?;

    let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(&path)
        .with_context(|| CreateFile { path: path.clone() })?;

    let new_len = content.len();

    match file.metadata() {
        Ok(old_len) if old_len.len() == new_len as u64 => {
            eprintln!("Using already saved DNA because length matches");
            return Ok(path_string.to_owned());
        }
        _ => {}
    }

    file.write_all(&content).with_context(|| WriteFile {
        num_bytes: content.len(),
        path,
    })?;

    Ok(path_string.to_owned())
}
