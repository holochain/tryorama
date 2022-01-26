use std::{
    io,
    path::{Path, PathBuf},
};

use snafu::{IntoError, ResultExt, Snafu};
use tokio::io::AsyncWriteExt;

use crate::DNA_DIR_PATH;
#[derive(Debug, Snafu)]
pub(crate) enum DownloadDnaError {
    #[snafu(display("Could not parse URL {:?}: {}", url, source))]
    ParseUrl {
        url: String,
        source: url::ParseError,
    },
    #[snafu(display("Could not create DNA file at {}: {}", path.display(), source))]
    CreateDna { path: PathBuf, source: io::Error },
    #[snafu(display("Could not open source DNA file at {}: {}", path, source))]
    OpenSource { path: String, source: io::Error },
    #[snafu(display("Could not write to DNA file at {}: {}", path.display(), source))]
    WriteDna { path: PathBuf, source: io::Error },
    #[snafu(display("Could not download source DNA from {}: {}", url, source))]
    RequestDna { url: String, source: reqwest::Error },
    #[snafu(display("Could not parse HTTP response from {}: {}", url, source))]
    ParseResponse { url: String, source: reqwest::Error },
}

pub(crate) async fn download_dna(url_str: String) -> Result<String, DownloadDnaError> {
    let url = url::Url::parse(&url_str).with_context(|| ParseUrl {
        url: url_str.clone(),
    })?;

    let path = get_downloaded_dna_path(&url);
    let path_string = path
        .to_str()
        .expect("path constructed from UTF-8 filename and UTF-8 directory should be valid UTF-8")
        .to_owned();

    let mut file = match try_create_file(&path).await {
        Ok(Some(file)) => file,
        Ok(None) => return Ok(path_string),
        Err(err) => return Err(CreateDna { path }.into_error(err)),
    };

    if url.scheme() == "file" {
        let source_path = url.path();
        let mut dna_file =
            tokio::fs::File::open(source_path)
                .await
                .with_context(|| OpenSource {
                    path: source_path.to_owned(),
                })?;
        tokio::io::copy(&mut dna_file, &mut file)
            .await
            .context(WriteDna { path })?;
    } else {
        println!("Downloading dna from {} ...", &url_str);
        let response = reqwest::get(url).await.with_context(|| RequestDna {
            url: url_str.clone(),
        })?;

        let content = response.bytes().await.with_context(|| ParseResponse {
            url: url_str.clone(),
        })?;
        println!("Finished downloading dna from {}", url_str);

        file.write_all(&content).await.context(WriteDna { path })?;
    };

    Ok(path_string)
}

fn get_downloaded_dna_path(url: &url::Url) -> PathBuf {
    Path::new(DNA_DIR_PATH)
        .join(url.scheme())
        .join(url.path().replace("/", "").replace("%", "_"))
}

/// Tries to create a file, returning Ok(None) if a file already exists at path
async fn try_create_file(path: &Path) -> Result<Option<tokio::fs::File>, io::Error> {
    tokio::fs::create_dir_all(path.parent().unwrap()).await?;
    match tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .await
    {
        Ok(file) => Ok(Some(file)),
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => Ok(None),
        Err(e) => Err(e),
    }
}
