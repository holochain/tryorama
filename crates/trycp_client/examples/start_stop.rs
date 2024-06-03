use trycp_client::*;

const ONE_MIN: std::time::Duration = std::time::Duration::from_secs(60);

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    let (c, _r) = TrycpClient::connect("ws://127.0.0.1:9000").await.unwrap();

    c.request(Request::Reset, ONE_MIN).await.unwrap();

    c.request(
        Request::ConfigurePlayer {
            id: "alice".to_string(),
            partial_config: "".to_string(),
        },
        ONE_MIN,
    )
    .await
    .unwrap();

    c.request(
        Request::Startup {
            id: "alice".to_string(),
            log_level: None,
        },
        ONE_MIN,
    )
    .await
    .unwrap();

    c.request(
        Request::Shutdown {
            id: "alice".to_string(),
            signal: None,
        },
        ONE_MIN,
    )
    .await
    .unwrap();

    c.request(Request::Reset, ONE_MIN).await.unwrap();
}
