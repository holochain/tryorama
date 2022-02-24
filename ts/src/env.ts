// const DEFAULT_HOLOCHAIN_PATH = "holochain";
// const DEFAULT_LAIR_PATH = "lair-keystore";
// const INTERFACE_ID_PREFIX =
// process.env["TRYORAMA_INTERFACE_ID"] || "tryorama-interface";

const VARS = {
  // adminInterfaceId: `${INTERFACE_ID_PREFIX}-admin`,
  // appInterfaceId: `${INTERFACE_ID_PREFIX}-app`,
  // stateDumpOnError: Boolean(process.env.TRYORAMA_STATE_DUMP || true),
  // conductorTimeoutMs:
  // Number(process.env.TRYORAMA_CONDUCTOR_TIMEOUT_MS) || 125000,
  // tempStorage: process.env.TRYORAMA_STORAGE,
  logLevel: process.env.TRYORAMA_LOG_LEVEL || "info",
  // portRange: [33000, 34000],
  // holochainPath: process.env.TRYORAMA_HOLOCHAIN_PATH || DEFAULT_HOLOCHAIN_PATH,
  // lairPath: process.env.TRYORAMA_LAIR_PATH || DEFAULT_LAIR_PATH,
};

export default VARS;
