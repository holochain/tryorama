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

export type TrycpClient = {
  setup: (id) => Promise<PartialConfigSeedArgs>,
  player: (id, configToml) => Promise<any>,
  spawn: (id) => Promise<any>,
  kill: (id, signal?) => Promise<any>,
  ping: (id) => Promise<string>,
  reset: () => Promise<void>,
  closeSession: () => Promise<void>,
}

export const trycpSession = async (url): Promise<TrycpClient> => {
  const { call, close } = await connect({ url })

  return {
    setup: (id) => call('setup')({ id }),
    player: (id, configToml) => call('player')({ id, config: base64.encode(configToml) }),
    spawn: (id) => call('spawn')({ id }),
    kill: (id, signal?) => call('kill')({ id, signal }),
    ping: (id) => call('ping')({ id }),
    reset: () => call('reset')({}),
    closeSession: () => close(),
  }
}

///////////////////////////////////////////////////////////////////
// Fake MMM stuff

const { spawn } = require('child_process')

type MmmConfigItem = { service: string, region: string, image: string }
type MmmConfig = Array<MmmConfigItem>

const provisionLocalTrycpServer = (port, spawner): Promise<string> => new Promise(async resolve => {
  const trycp = spawner();
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

const fakeTrycpServer = async (port: number): Promise<string> => new Promise(async resolve => {
  return provisionLocalTrycpServer(port, () => spawn('trycp_server', ['-p', String(port)]));
})

const localDockerTrycpServer = async (dockerImage: string, port: number): Promise<string> => new Promise(async resolve => {
  return provisionLocalTrycpServer(port, () => spawn('docker', ['--expose', `${port}:443`, dockerImage]));
})

export const fakeMmmConfigs = (num, dockerImage): MmmConfig => {
  return _.range(num).map(n => ({
    service: moniker.choose(),
    region: 'whatever',
    image: dockerImage,
  }))
}

export const spinupLocalCluster = (mmmConfig: MmmConfig): Promise<Array<string>> => {
  let basePort = 40000
  return Promise.all(mmmConfig.map(({ image }, n) => localDockerTrycpServer(image, basePort + n)))
}
