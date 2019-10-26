import { connect } from '@holochain/hc-web-client'
import logger from './logger'
const base64 = require('base-64')

export type TrycpSession = {
  getArgs: () => Promise<any>,
  player: (id, configToml) => Promise<any>,
  spawn: (id) => Promise<any>,
  kill: (id, signal?) => Promise<any>,
  ping: (id) => Promise<string>,
  closeSession: () => Promise<void>,
}

export const trycpSession = async (url): Promise<TrycpSession> => {
  const { call, close } = await connect(url)

  return {
    getArgs: () => call('get_args')({}),
    player: (id, configToml) => call('player')({ id, config: base64.encode(configToml) }),
    spawn: (id) => call('spawn')({ id }),
    kill: (id, signal?) => call('kill')({ id, signal }),
    ping: (id) => call('ping')({ id }),
    closeSession: () => close(),
  }
}

export const invokeMRMM = (url) => {
  logger.warn("Using fake MRMM which spins up trycp servers on local machine!")
  return fakeTrycpServer()
}

const fakeTrycpServer = async (): Promise<{ host: string, port: number }> => new Promise(async resolve => {
  const { getPort } = require('./config/get-port-cautiously')
  const { spawn } = require('child_process')

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
