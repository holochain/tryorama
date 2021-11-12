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
import { AgentPubKey, HoloHash, DnaSource as LocalDnaSource } from '@holochain/conductor-api';

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
  network?: KitsuneP2pConfig,
  db_sync_level?: string,
  appPort?: number
}

export type ConfigSeedArgs = PartialConfigSeedArgs & {
  scenarioName: string,
  playerName: string,
  uid: string,
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
export type DnaSrc = DnaPath | HoloHash | DnaUrl
export type InstallHapp = DnaSrc[]
export type DnaPath = string
export type DnaUrl = { url: string }

export type DnaSource = LocalDnaSource | { url: string }

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

export interface WsInterfaceConfig {
  driver: {
    type: string
    port: number
  }
}

export interface PassphraseServiceConfig {
    type: string,
    passphrase: string,
}

export interface RawConductorConfig {
  environment_path: string,
  keystore: KeystoreConfig,
  signing_service_uri?: string,
  encryption_service_uri?: string,
  decryption_service_uri?: string,
  keystore_path?: string,
  admin_interfaces?: WsInterfaceConfig[],
  app_interfaces?: WsInterfaceConfig[],
  db_sync_level?: string,
  network?: KitsuneP2pConfig,
}

export interface KeystoreConfig {
  type: string;
  keystore_path: string;
  danger_passphrase_insecure_from_config: string;
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

export enum NetworkType {
    QuicBootstrap = 'quic_bootstrap',
    QuicMdns = 'quic_mdns'
}

export type TransportConfig = (Mem | Quic | Proxy)

// Derived from https://github.com/holochain/holochain/blob/d3a991df1732603419adbda96e8fb8e525e829cb/crates/kitsune_p2p/kitsune_p2p/src/config.rs
// must stay in sync
export interface KitsuneP2pConfig {
  network_type: NetworkType,
  transport_pool: TransportConfig[],
  bootstrap_service?: Url2
  tuning_params?: TuningParams
}

export interface TuningParams {
  gossip_loop_iteration_delay_ms: number // default 10
  default_notify_remote_agent_count: number // default 5
  default_notify_timeout_ms: number // default 1000
  default_rpc_single_timeout_ms: number // default 2000
  default_rpc_multi_remote_agent_count: number // default 2
  default_rpc_multi_timeout_ms: number // default 2000
  agent_info_expires_after_ms: number // default 1000 * 60 * 20 (20 minutes)
  tls_in_mem_session_storage: number // default 512
  proxy_keepalive_ms: number // default 1000 * 60 * 2 (2 minutes)
  proxy_to_expire_ms: number // default 1000 * 6 * 5 (5 minutes)
}

export type KillFn = (signal?: string) => Promise<void>

