export default {
  stateDumpOnError: process.env['TRYORAMA_STATE_DUMP'] || true,
  strictConductorTimeout: process.env['TRYORAMA_STRICT_CONDUCTOR_TIMEOUT'] || false,
  tempStorage: process.env['TRYORAMA_STORAGE'],
}