// const DEFAULT_HOLOCHAIN_PATH = "holochain";
// const DEFAULT_LAIR_PATH = "lair-keystore";
// const INTERFACE_ID_PREFIX =
// process.env["TRYORAMA_INTERFACE_ID"] || "tryorama-interface";

const VARS = {
  // adminInterfaceId: `${INTERFACE_ID_PREFIX}-admin`,
  // appInterfaceId: `${INTERFACE_ID_PREFIX}-app`,
  // stateDumpOnError: Boolean(process.env.TRYORAMA_STATE_DUMP || true),
  // zomeCallTimeoutMs: Number(process.env.TRYORAMA_ZOME_CALL_TIMEOUT_MS) || 90000,
  // conductorTimeoutMs:
  // Number(process.env.TRYORAMA_CONDUCTOR_TIMEOUT_MS) || 125000,
  // strictConductorTimeout: Boolean(
  // process.env.TRYORAMA_STRICT_CONDUCTOR_TIMEOUT
  // ),
  // tempStorage: process.env.TRYORAMA_STORAGE,
  // chooseFreePort: Boolean(process.env.TRYORAMA_CHOOSE_FREE_PORT),
  logLevel: process.env.TRYORAMA_LOG_LEVEL || "info",
  // portRange: [33000, 34000],
  // singletonAppId: "TRYORAMA_APP",
  // holochainPath: process.env.TRYORAMA_HOLOCHAIN_PATH || DEFAULT_HOLOCHAIN_PATH,
  // lairPath: process.env.TRYORAMA_LAIR_PATH || DEFAULT_LAIR_PATH,
};

export default VARS;
