import logger from "./logger"

const int = (n) => {
  try {
    return parseInt(n, 10)
  } catch (e) {
    return undefined
  }
}

const float = (n) => {
  try {
    return parseFloat(n)
  } catch (e) {
    return undefined
  }
}

const VARS = {
  adminInterfaceId: process.env['TRYORAMA_ADMIN_INTERFACE_ID'] || 'tryorama-admin-interface',
  zomeInterfaceId: process.env['TRYORAMA_ZOME_INTERFACE_ID'] || 'tryorama-zome-interface',
  stateDumpOnError: process.env['TRYORAMA_STATE_DUMP'] || true,
  zomeCallTimeoutMs: int(process.env['TRYORAMA_ZOME_CALL_TIMEOUT_MS']) || 90000,
  conductorTimeoutMs: int(process.env['TRYORAMA_CONDUCTOR_TIMEOUT_MS']) || 125000,
  strictConductorTimeout: process.env['TRYORAMA_STRICT_CONDUCTOR_TIMEOUT'] || false,
  tempStorage: process.env['TRYORAMA_STORAGE'],
  portRange: [33000, 34000],  // not hooked up to env var yet
}

logger.info("Using the following settings from environment variables:")
logger.info(JSON.stringify(VARS, null, 2))

export default VARS
