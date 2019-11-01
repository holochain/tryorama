import * as _ from 'lodash'
import { connect } from '@holochain/hc-web-client'
import logger from './logger'
import * as T from './types'
import { notImplemented } from './common'
const base64 = require('base-64')
const moniker = require('moniker')

type PartialConfigSeedArgs = {
  adminPort: number,
  zomePort: number,
  configDir: string,
}

export type TrycpSession = {
  setup: (id) => Promise<PartialConfigSeedArgs>,
  player: (id, configToml) => Promise<any>,
  spawn: (id) => Promise<any>,
  kill: (id, signal?) => Promise<any>,
  ping: (id) => Promise<string>,
  closeSession: () => Promise<void>,
}

export const trycpSession = async (url): Promise<TrycpSession> => {
  const { call, close } = await connect({ url })

  return {
    setup: (id) => call('setup')({ id }),
    player: (id, configToml) => call('player')({ id, config: base64.encode(configToml) }),
    spawn: (id) => call('spawn')({ id }),
    kill: (id, signal?) => call('kill')({ id, signal }),
    ping: (id) => call('ping')({ id }),
    closeSession: () => close(),
  }
}

///////////////////////////////////////////////////////////////////
// Fake MMM stuff


type MmmConfigItem = { service: string, region: string, image: string }
type MmmConfig = Array<MmmConfigItem>

// TODO: use docker image instead
const fakeTrycpServer = async (port): Promise<string> => new Promise(async resolve => {
  const { spawn } = require('child_process')

  const trycp = spawn('trycp_server', ['-p', String(port)]);
  trycp.stdout.on('data', (data) => {
    var regex = new RegExp("waiting for connections on port " + port);
    if (regex.test(data)) {
      resolve(`ws://localhost:${port}`)
    }
    console.log(`stdout: ${data}`);
  });
  trycp.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });
})

export const fakeMmmConfigs = (num): MmmConfig => {
  return _.range(num).map(n => ({
    service: moniker.choose(),
    region: 'whatever',
    image: 'TODO',
  }))
}

export const spinupLocalCluster = (mmmConfig: MmmConfig): Promise<Array<string>> => {
  let basePort = 40000
  return Promise.all(mmmConfig.map((_config, n) => fakeTrycpServer(basePort + n)))
}
