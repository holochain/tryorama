export * from "./server";
export * from "./helpers";
export * from "./scenarios";

export const LOCAL_TEST_PARTIAL_PLAYER_CONFIG = `signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
network:
  transport_pool:
    - type: quic
      bind_to: kitsune-quic://0.0.0.0:0
  network_type: quic_mdns`;
