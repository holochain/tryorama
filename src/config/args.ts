import { tempDir, getConfigPath } from "./gen"
import { getPort } from './get-port-cautiously'
import logger from '../logger'
import * as T from '../types'
import { spawn } from "child_process"
import { trycpSession } from "src/trycp"
const fs = require('fs').promises
const base64 = require('base-64')

/**
 * Function to generate the args for genConfig functions.
 * This can be overridden as part of Orchestrator config.
 *
 * NB: Since we are using ports, there is a small chance of a race condition
 * when multiple conductors are attempting to secure ports for their interfaces.
 * In the future it would be great to move to domain socket based interfaces.
 */
export const makeLocalGenConfigArgs = async (playerName: string, uuid: string): Promise<T.GenConfigArgs> => {
  const adminPort = await getPort()
  const zomePort = await getPort()
  const configDir = await tempDir()
  const urlBase = `http://localhost`
  const commitConfig = (configToml) => fs.writeFile(getConfigPath(configDir), configToml)
  return { playerName, commitConfig, urlBase, adminPort, zomePort, uuid }
}

export const makeRemoteGenConfigArgs = async (playerName: string, uuid: string): Promise<T.GenConfigArgs> => {
  const { urlBase, trycpPort, adminPort, zomePort } = await getMachineDataFromMRMM()
  const trycpUrl = urlBase + ':' + trycpPort
  const commitConfig = (configToml) => trycpSession(trycpUrl, playerName).then(trycp => trycp.player(base64.encode(configToml)))
  return { playerName, commitConfig, urlBase, adminPort, zomePort, uuid }
}


const getMachineDataFromMRMM = async (): Promise<_> => {
  const { host, port } = await fakeMRMM()
  return {
    urlBase: host,
    trycpPort: port,
    adminPort: await getPort(),
    zomePort: await getPort(),
  }
}

const fakeMRMM = async (): Promise<{ host: string, port: number }> => new Promise(async resolve => {
  const port = await getPort()
  const trycp = spawn('trycp_server', ['-p', String(port)]);
  trycp.stdout.on('data', (data) => {
    var regex = new RegExp("waiting for connections on port " + port);
    if (regex.test(data)) {
      resolve({ host: "ws://localhost", port })
    }
    console.log(`stdout: ${data}`);
  });
  trycp.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });
})
