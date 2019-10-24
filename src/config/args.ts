import { tempDir } from "./gen"
import { getPort } from './get-port-cautiously'
import logger from '../logger'
import * as T from '../types'

/**
 * Function to generate the default args for genConfig functions.
 * This can be overridden as part of Orchestrator config.
 * NB: Since we are using ports, there is a small chance of a race condition
 * when multiple conductors are attempting to secure ports for their interfaces.
 * In the future it would be great to move to domain socket based interfaces.
 */
export const makeLocalGenConfigArgs = async (playerName: string, uuid: string): Promise<T.GenConfigArgs> => {
  const adminPort = await getPort()
  const zomePort = await getPort()
  const configDir = await tempDir()
  const urlBase = `http://localhost`
  return { playerName, configDir, urlBase, adminPort, zomePort, uuid }
}

export const makeRemoteGenConfigArgs = async (playerName: string, uuid: string): Promise<T.GenConfigArgs> => {
  const { urlBase, adminPort, zomePort } = await getMachineDataFromMRMM()
  const configDir = null
  return { playerName, configDir, urlBase, adminPort, zomePort, uuid }
}

const getMachineDataFromMRMM = async (): Promise<{ urlBase: string, adminPort: number, zomePort: number }> => {
  return {
    urlBase: 'TODO',
    adminPort: 1111,
    zomePort: 2222,
  }
}
