const VARS = {
  // adminInterfaceId: `${INTERFACE_ID_PREFIX}-admin`,
  // appInterfaceId: `${INTERFACE_ID_PREFIX}-app`,
  // stateDumpOnError: Boolean(process.env.TRYORAMA_STATE_DUMP || true),
  // conductorTimeoutMs:
  // Number(process.env.TRYORAMA_CONDUCTOR_TIMEOUT_MS) || 125000,
  logLevel: process.env.TRYORAMA_LOG_LEVEL || "info",
};

export default VARS;
