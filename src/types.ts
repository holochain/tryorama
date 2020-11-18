import * as _ from 'lodash'
import { ScenarioApi } from "./api"
// import * as t from "io-ts"
import { reporter } from 'io-ts-reporters'
// import { ThrowReporter } from "io-ts/lib/ThrowReporter"
// import { ChildProcess } from 'child_process';
import logger from "./logger";
import { Conductor } from "./conductor"
import { Player } from "./player"
import { Cell } from './cell';
import { AgentPubKey } from '@holochain/conductor-api';

export const decodeOrThrow = (validator, value, extraMsg = '') => {
  const result = validator.decode(value)
  const errors = reporter(result)
  if (errors.length > 0) {
    const msg = `${extraMsg ? extraMsg + '\n' : ''}Tried to use an invalid value for a complex type and found the following problems:\n    - ${errors.join("\n    - ")}`
    logger.error(msg)
    throw new Error(msg)
  }
  return result
}

export type ObjectN<V> = { [name: number]: V }
export type ObjectS<V> = { [name: string]: V }

export type SpawnConductorFn = (player: Player, args: any) => Promise<Conductor>

export type ScenarioFn = (s: ScenarioApi) => Promise<void>

export type IntermediateConfig = RawConductorConfig  // TODO: constrain

export type ConfigSeed = (args: ConfigSeedArgs) => IntermediateConfig

export type PartialConfigSeedArgs = {
  adminInterfacePort: number,
  configDir: string,
}
export type CommonConfig = {
  network?: KitsuneP2pConfig
}

export type ConfigSeedArgs = PartialConfigSeedArgs & {
  scenarioName: string,
  playerName: string,
  uuid: string,
}

// export type PlayerConfigs = ObjectS<PlayerConfig>
export type PlayerConfig = ConfigSeed



/*
InstallAgentsHapps
there will be one agent generated per each in this list
## example 1
one agent, one happ, 4 dnas
[[['dna1', 'dna2', 'dna3', 'dna4']]]

## example 2
two agents, one happ, two dnas each
[[['dna1', 'dna2']], [['dna3', 'dna4']]]

## example 3
sometimes we can write it like this to make it easier to read
[
  agent one
  [
    happ one, two dnas
    ['dna1', 'dna2']
  ]
]
*/
export type InstallAgentsHapps = InstallHapps[]
export type InstallHapps = InstallHapp[]
export type InstallHapp = DnaPath[]
export type DnaPath = string

// the mirror of InstallAgentHapps
export type InstalledAgentHapps = InstalledHapps[]
// the mirror of InstallHapps
export type InstalledHapps = InstalledHapp[]

// the mirror of InstallHapp, but more javascripty
// and could eventually become a class
// also includes the hAppId as it is needed in some cases
export type InstalledHapp = {
  hAppId: string,
  // the agent shared by all the Cell instances in `.cells`
  agent: AgentPubKey
  // the instantiated cells, which allow
  // for actual zome calls
  cells: Cell[]
}

// export type MachineConfigs = ObjectS<PlayerConfigs>

export const adminWsUrl = ({ urlBase, port }) => `${urlBase}:${port}`

export interface RawConductorConfig {
  environment_path: string,
  use_dangerous_test_keystore: boolean,
  signing_service_uri?: string,
  encryption_service_uri?: string,
  decryption_service_uri?: string,
  keystore_path?: string,
  network?: KitsuneP2pConfig,
  // TODO:
  // passphrase_service?: PassphraseServiceConfig,
  // admin_interfaces?: Array<AdminInterfaceConfig>
}

export type Url2 = string
export enum TransportConfigType {
  Mem = 'mem',
  Quic = 'quic',
  Proxy = 'proxy'
}
export interface Mem {
  type: TransportConfigType
}
export interface Quic {
  type: TransportConfigType,
  bind_to?: Url2,
  override_host?: string,
  override_port?: number
}
export interface Proxy {
  type: TransportConfigType,
  sub_transport: TransportConfig,
  proxy_config: RemoteProxyClient | LocalProxyServer
}
export enum ProxyConfigType {
  RemoteProxyClient = 'remote_proxy_client',
  LocalProxyServer = 'local_proxy_server'
}
export interface RemoteProxyClient {
  type: ProxyConfigType,
  proxy_url: Url2
}
export interface LocalProxyServer {
  type: ProxyConfigType,
  proxy_accept_config?: ProxyAcceptConfig
}
export enum ProxyAcceptConfig {
  AcceptAll = 'accept_all',
  RejectAll = 'reject_all'
}

export type TransportConfig = ( Mem | Quic | Proxy )

export interface KitsuneP2pConfig {
  transport_pool: TransportConfig[],
  bootstrap_service?: Url2
}
export type KillFn = (signal?: string) => Promise<void>
