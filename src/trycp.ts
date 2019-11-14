import * as _ from 'lodash'
import { connect } from '@holochain/hc-web-client'
import logger from './logger'
import * as T from './types'
import { notImplemented } from './common'
import { exec, execSync, spawn, ChildProcess } from 'child_process'
const base64 = require('base-64')
const moniker = require('moniker')
const TOML = require('@iarna/toml')

export type TrycpClient = {
  setup: (id) => Promise<T.PartialConfigSeedArgs>,
  dna: (url: string) => Promise<{path: string}>,
  player: (id, config: T.RawConductorConfig) => Promise<any>,
  spawn: (id) => Promise<any>,
  kill: (id, signal?) => Promise<any>,
  ping: (id) => Promise<string>,
  reset: () => Promise<void>,
  closeSession: () => Promise<void>,
}

export const trycpSession = async (url): Promise<TrycpClient> => {
  const { call, close } = await connect({ url })

  const makeCall = (method) => async (a) => {
    logger.debug(`trycp client request to ${url}: ${method} => ${JSON.stringify(a, null, 2)}`)
    const result = await call(method)(a)
    logger.debug('trycp client response: %j', result)
    return result
  }

  return {
    setup: (id) => makeCall('setup')({ id }),
    dna: (url) => makeCall('dna')({ url }),
    player: (id, config) => makeCall('player')({ id, config: base64.encode(TOML.stringify(config)) }),
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

type EndpointPair = [string, ChildProcess]

type MmmConfigItem = { service: string, subnet: string, region: string, image: string, instance_type: string }
type MmmConfig = Array<MmmConfigItem>

/** Pipes process output to node stdout */
const spawnWithOutput = (name, spawner) => {
  const proc = spawner()
  proc.stdout.on('data', (data) => {
    console.log(`stdout ${name}: ${data}`);
  });
  proc.stderr.on('data', (data) => {
    console.error(`stderr ${name}: ${data}`);
  });
  return proc
}

/** 
 * Spawns trycp_server and awaits for it to be ready for connection 
 * Returns the pair of endpoint URL as well as process handle
 */
const provisionLocalTrycpServer = (name: string, port, spawner): Promise<EndpointPair> => new Promise((resolve, reject) => {
  const trycp = spawnWithOutput(name, spawner);
  setTimeout(() => reject(`Conductor on port ${port} took more than 60 seconds to get ready, aborting.`), 60000)
  trycp.stdout.on('data', (data) => {
    // NB: the port on the machine may not be the port that we'll connect to, e.g. in the case of a docker container
    const regex = new RegExp(/waiting for connections on port (\d{1,5})/);
    if (regex.test(data)) {
      resolve([`ws://localhost:${port}`, trycp])
    }
  });
})

/** 
 * Spawns a local, uncontainerized trycp_server 
 * Returns the pair of endpoint URL as well as process handle
 */
const fakeTrycpServer = async (config: MmmConfigItem, port: number): Promise<EndpointPair> => {
  return provisionLocalTrycpServer(config.service, port, () => spawn('trycp_server', ['-p', String(port), '--port-range', '1100-1200']));
}

/** 
 * Spawns a local, docker-containerized trycp_server
 * Returns the pair of endpoint URL as well as process handle
 */
const localDockerTrycpServer = () => {
  const rangeSize = 20
  let nextRangeStart = 10000
  return async (config: MmmConfigItem, port: number): Promise<EndpointPair> => {
    // console.log('DOCKER: ', execSync('which docker').toString('utf8'))
    // console.log('DOCKER: ', execSync('docker  --version').toString('utf8'))
    const start = nextRangeStart
    nextRangeStart += rangeSize
    const rangeString = `${start}-${nextRangeStart-1}`
    const command = ['trycp_server', '-p', `${port}`, '--port-range', rangeString]
    return provisionLocalTrycpServer(config.service, port, () => spawn('docker', [
      'run', 
      '-p', `${port}:${port}`, 
      '-p', `${rangeString}:${rangeString}`, 
      '--name', config.service,
      '--network', 'trycp',
      config.image, 
      ...command
    ]));
  }
}

/** Generates some fake config which resembles data that would be sent to the MMM EC2 node spinner upper */
export const fakeMmmConfigs = (num, dockerImage): MmmConfig => {
  return _.range(num).map(n => ({
    service: moniker.choose(),
    subnet: 'SubnetAPublic',
    region: 'eu-central-1',
    image: dockerImage,
    instance_type: "m5.large",
  }))
}

/**
 * Simulates MMM, taking a config and spawning a local cluster of trycp servers.
 * Returns an array of endpoints which can be passed to try-o-rama machinePerPlayer middleware,
 * as well as an array of child processes which can be used to kill the processes after testing is complete.
 */
export const spinupLocalCluster = async (mmmConfig: MmmConfig, docker: boolean): Promise<[Array<string>, Array<ChildProcess>]> => {
  let basePort = 40000
  const makeServer = docker ? localDockerTrycpServer() : fakeTrycpServer
  const endpointPromises = mmmConfig.map((config, n) => makeServer(config, basePort + n))
  const pairs = await Promise.all(endpointPromises)
  // spawnWithOutput('sim2h', () => spawn('docker', [
  //   'run',
  //   '-p', `9000:9000`,
  //   '--name', 'sim2h',
  //   '--network', 'trycp',
  //   'holochain/sim2h_server:latest',
  // ]))
  const unzipped = _.reduce(pairs, ([es, ps], [e, p]) => [_.concat(es, e), _.concat(ps, p)], [[], []])
  return unzipped as [Array<string>, Array<ChildProcess>]
}

export const awsClusterConfig2Endpoints = (config): Array<string> => {
    const endpoints = config.map((node) => `wss://${node.service}.${node.region}.holochain-aws.org`)
    return endpoints
}
