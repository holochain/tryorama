import * as _ from 'lodash'
import { connect } from '@holochain/hc-web-client'
import logger from './logger'
import * as T from './types'
import { notImplemented } from './common'
import { exec, execSync, spawn } from 'child_process'
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

  const makeCall = (method) => (a) => {
    logger.debug(`trycp client ${url}: ${method} => ${JSON.stringify(a, null, 2)}`)
    return call(method)(a)
  }

  return {
    setup: (id) => makeCall('setup')({ id }),
    player: (id, configToml) => makeCall('player')({ id, config: base64.encode(configToml) }),
    spawn: (id) => makeCall('spawn')({ id }),
    kill: (id, signal?) => makeCall('kill')({ id, signal }),
    ping: (id) => makeCall('ping')({ id }),
    reset: () => makeCall('reset')({}),
    closeSession: () => close(),
  }
}

///////////////////////////////////////////////////////////////////
// Fake MMM stuff

/*
e.g.
{
  "service": "test1",
  "subnet": "SubnetAPublic",
  "region": "eu-central-1",
  "image": "holochain/holochain-rust:trycp",
  "instance_type" : "m5.large"
},
*/

type MmmConfigItem = { service: string, subnet: string, region: string, image: string, instance_type: string }
type MmmConfig = Array<MmmConfigItem>

const provisionLocalTrycpServer = (name: string, port, spawner): Promise<string> => new Promise((resolve, reject) => {
  const trycp = spawner();
  setTimeout(() => reject(`Conductor on port ${port} took more than 60 seconds to get ready, aborting.`), 60000)
  trycp.stdout.on('data', (data) => {
    // NB: the port on the machine may not be the port that we'll connect to, e.g. in the case of a docker container
    var regex = new RegExp(/waiting for connections on port (\d{1,5})/);
    if (regex.test(data)) {
      resolve(`ws://localhost:${port}`)
    }
    console.log(`stdout ${name}: ${data}`);
  });
  trycp.stderr.on('data', (data) => {
    console.error(`stderr ${name}: ${data}`);
  });
})

const fakeTrycpServer = async (config: MmmConfigItem, port: number): Promise<string> => {
  return provisionLocalTrycpServer(config.service, port, () => spawn('trycp_server', ['-p', String(port), '--port-range', '1100-1200']));
}

const localDockerTrycpServer = () => {
  const rangeSize = 20
  let nextRangeStart = 1000
  return async (config: MmmConfigItem, port: number): Promise<string> => {
    // console.log('DOCKER: ', execSync('which docker').toString('utf8'))
    // console.log('DOCKER: ', execSync('docker  --version').toString('utf8'))
    const start = nextRangeStart
    nextRangeStart += rangeSize
    const rangeString = `${start}-${nextRangeStart-1}`
    const command = ['trycp_server', '-p', `${port}`, '--port-range', rangeString]
    return provisionLocalTrycpServer(config.service, port, () => spawn('docker', ['run', '-p', `${port}:${port}`, '-p', `${rangeString}:${rangeString}`, config.image, ...command]));
  }
}

export const fakeMmmConfigs = (num, dockerImage): MmmConfig => {
  return _.range(num).map(n => ({
    service: moniker.choose(),
    subnet: 'SubnetAPublic',
    region: 'eu-central-1',
    image: dockerImage,
    instance_type: "m5.large",
  }))
}

export const spinupLocalCluster = async (mmmConfig: MmmConfig, docker: boolean): Promise<Array<string>> => {
  let basePort = 40000
  const makeServer = docker ? localDockerTrycpServer() : fakeTrycpServer
  const endpointPromises = mmmConfig.map((config, n) => makeServer(config, basePort + n))
  const endpoints = Promise.all(endpointPromises)
  return endpoints
}
