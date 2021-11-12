import * as T from "../types";
import _ from "lodash";
import path from "path";

// default networking type is for QuicBootstrap but we don't provide a
// bootstrap server, so default action discovery is explicit with shareAllNodes
const defaultCommonConfig = {
  network: {
    network_type: T.NetworkType.QuicBootstrap,
    transport_pool: [
      {
        type: T.TransportConfigType.Quic,
      },
    ],
  },
};

export const gen =
  (commonConfig: T.CommonConfig = {}): T.ConfigSeed =>
  (args: T.ConfigSeedArgs): T.RawConductorConfig => {
    const { configDir, adminInterfacePort, uid } = args;
    const keystorePath = path.join(configDir, "keystore");

    // don't put any keys on this object that you want to fall back to defaults
    const specific: T.RawConductorConfig = {
      environment_path: configDir,
      keystore: {
        type: "lair_server_legacy_deprecated",
        keystore_path: keystorePath,
        danger_passphrase_insecure_from_config: "pass",
      },
      admin_interfaces: [
        {
          driver: {
            type: "websocket",
            port: adminInterfacePort,
          },
        },
      ],
      app_interfaces: [
        {
          driver: {
            type: "websocket",
            port: commonConfig.appPort || 0,
          },
        },
      ],
      ...(commonConfig.db_sync_level
        ? { db_sync_level: commonConfig.db_sync_level }
        : {}),
      ...(commonConfig.network ? { network: commonConfig.network } : {}),
    };

    // apply from left to right, in order of precedence
    // so this will override defaults with specifically set values
    // https://lodash.com/docs/4.17.15#merge
    return _.merge({}, defaultCommonConfig, specific);
  };

export const getConfigPath = (configDir: string) =>
  path.join(configDir, "conductor-config.yml");
