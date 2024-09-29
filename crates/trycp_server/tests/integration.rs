use std::process::Stdio;

use holochain_conductor_api::conductor::ConductorConfig;
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Child,
};
use trycp_api::Request;

const ONE_MIN: std::time::Duration = std::time::Duration::from_secs(60);

#[tokio::test(flavor = "multi_thread")]
async fn multiple_conductors_on_same_machine_are_assigned_different_admin_ports() {
    let port_1 = 9000;
    let port_2 = 9001;
    let id_player_1 = "player_1";
    let id_player_2 = "player_2";

    // Start 1 server.
    let mut trycp_server_1 = tokio::process::Command::new("cargo")
        .arg("run")
        .arg("--release")
        .arg("--target-dir")
        .arg("crates/trycp_server/target")
        .arg("--")
        .arg("-p")
        .arg(port_1.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .expect("trycp server could not be started");
    let (trycp_server_running_1, config_path_rx_1) = spawn_output(&mut trycp_server_1);
    trycp_server_running_1.await.unwrap();

    // Connect client to server 1 and configure a conductor.
    let (trycp_client_1, _) =
        trycp_client::TrycpClient::connect(format!("ws://localhost:{port_1}"))
            .await
            .unwrap();
    let join_handle_1 = tokio::spawn(async move {
        trycp_client_1
            .request(
                Request::ConfigurePlayer {
                    id: id_player_1.to_string(),
                    partial_config: "dpki:
    dna_path: ~
    network_seed: test
    allow_throwaway_random_dpki_agent_key: true
    no_dpki: false"
                        .to_string(),
                },
                ONE_MIN,
            )
            .await
            .unwrap();
        trycp_client_1
    });

    let config_path_1 = config_path_rx_1.await.unwrap();

    let trycp_client_1 = join_handle_1.await.unwrap();

    let config_1 =
        serde_yaml::from_str::<ConductorConfig>(&std::fs::read_to_string(config_path_1).unwrap())
            .unwrap();

    let admin_port_1 = config_1
        .admin_interfaces
        .unwrap()
        .first()
        .unwrap()
        .driver
        .port();

    // Start up conductor on server 1.
    trycp_client_1
        .request(
            Request::Startup {
                id: id_player_1.to_string(),
                log_level: None,
            },
            ONE_MIN,
        )
        .await
        .unwrap();

    // Start server 2 on same machine.
    let mut trycp_server_2 = tokio::process::Command::new("cargo")
        .arg("run")
        .arg("--release")
        .arg("--target-dir")
        .arg("crates/trycp_server/target")
        .arg("--")
        .arg("-p")
        .arg(port_2.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .expect("trycp server could not be started");
    let (trycp_server_running_2, config_path_rx_2) = spawn_output(&mut trycp_server_2);
    trycp_server_running_2.await.unwrap();

    // Connect client to server 2 and configure a conductor.
    let (trycp_client_2, _) =
        trycp_client::TrycpClient::connect(format!("ws://localhost:{port_2}"))
            .await
            .unwrap();
    let join_handle_2 = tokio::spawn(async move {
        trycp_client_2
            .request(
                Request::ConfigurePlayer {
                    id: id_player_2.to_string(),
                    partial_config: "dpki:
    dna_path: ~
    network_seed: test
    allow_throwaway_random_dpki_agent_key: true
    no_dpki: false"
                        .to_string(),
                },
                ONE_MIN,
            )
            .await
            .unwrap();
        trycp_client_2
    });

    let config_path_2 = config_path_rx_2.await.unwrap();

    let trycp_client_2 = join_handle_2.await.unwrap();

    let config_2 =
        serde_yaml::from_str::<ConductorConfig>(&std::fs::read_to_string(config_path_2).unwrap())
            .unwrap();

    let admin_port_2 = config_2
        .admin_interfaces
        .unwrap()
        .first()
        .unwrap()
        .driver
        .port();

    // The two admin ports should be different.
    assert_ne!(
        admin_port_1, admin_port_2,
        "conductors were not assigned different admin ports"
    );

    drop(trycp_client_2);
    trycp_client_1
        .request(Request::Reset, ONE_MIN)
        .await
        .unwrap();
}

fn spawn_output(
    trycp_server: &mut Child,
) -> (
    tokio::sync::oneshot::Receiver<()>,
    tokio::sync::oneshot::Receiver<String>,
) {
    let stdout = trycp_server.stdout.take().unwrap();
    let (tx, rx) = tokio::sync::oneshot::channel();
    let (config_path_tx, config_path_rx) = tokio::sync::oneshot::channel();
    // Wrap in an Option because it is used in a loop and cannot be cloned.
    let mut tx = Some(tx);
    let mut config_path_tx = Some(config_path_tx);
    tokio::task::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            println!("trycp_server stdout: {}", &line);
            if let Some(_) = line.strip_prefix("Listening on ") {
                if let Some(tx) = tx.take() {
                    let _ = tx.send(());
                }
            } else {
                if let Some(config_output) = line.strip_prefix("wrote config for player") {
                    if let Some(config_path_tx) = config_path_tx.take() {
                        let config_path = config_output.rsplit(" ").next().unwrap();
                        let _ = config_path_tx.send(config_path.to_string());
                    }
                }
            }
        }
    });
    (rx, config_path_rx)
}
