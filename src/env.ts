
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

const bool = Boolean

const legacy = bool(process.env['TRYORAMA_LEGACY'] || false)
const defaultHolochainPath = 'holochain'
const interfaceIdPrefix = process.env['TRYORAMA_INTERFACE_ID'] || 'tryorama-interface'

const VARS = {
  adminInterfaceId: `${interfaceIdPrefix}-admin`,
  appInterfaceId: `${interfaceIdPrefix}-app`,
  stateDumpOnError: bool(process.env['TRYORAMA_STATE_DUMP'] || true),
  zomeCallTimeoutMs: int(process.env['TRYORAMA_ZOME_CALL_TIMEOUT_MS']) || 90000,
  conductorTimeoutMs: int(process.env['TRYORAMA_CONDUCTOR_TIMEOUT_MS']) || 125000,
  strictConductorTimeout: bool(process.env['TRYORAMA_STRICT_CONDUCTOR_TIMEOUT']),
  tempStorage: process.env['TRYORAMA_STORAGE'],
  chooseFreePort: bool(process.env['TRYORAMA_CHOOSE_FREE_PORT']),
  logLevel: process.env['TRYORAMA_LOG_LEVEL'],
  portRange: [33000, 34000],  // not hooked up to env var yet
  legacy,
  holochainPath: process.env.TRYORAMA_HOLOCHAIN_PATH || defaultHolochainPath
}


export default VARS
