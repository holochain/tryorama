import { tempDir } from "./common"
import { getPort } from './get-port-cautiously'
import logger from '../logger'
import * as T from '../types'
const fs = require('fs').promises

/**
 * Function to generate the args for genConfig functions.
 * This can be overridden as part of Orchestrator config.
 *
 * NB: Since we are using ports, there is a small chance of a race condition
 * when multiple conductors are attempting to secure ports for their interfaces.
 * In the future it would be great to move to domain socket based interfaces.
 */
export const localConfigSeedArgs = async (): Promise<T.PartialConfigSeedArgs> => {
  const adminInterfacePort = await getPort()
  const appInterfacePort = await getPort()
  const configDir = await tempDir()
  return { configDir, adminInterfacePort, appInterfacePort }
}
