import _ from 'lodash'
import { ScenarioApi } from "./api";

export type ObjectN<V> = { [name: number]: V }
export type ObjectS<V> = { [name: string]: V }

export type SpawnConductorFn = (name: string, configPath: string) => Promise<Mortal>

export type ScenarioFn = (s: ScenarioApi) => Promise<void>

export type GenConfigFn = (args: GenConfigArgs, uuid: string) => Promise<string>
export type GenConfigArgs = {
  configDir: string,
  adminPort: number,
  zomePort: number
}

type ConductorConfigCommon = {
  name: string,
  bridges?: Array<BridgeConfig>,
  dpki?: DpkiConfig,
}

/** Base representation of a Conductor */
export type ConductorConfig = ConductorConfigCommon & {
  instances: Array<InstanceConfig>,
}

/** Shorthand representation of a Conductor, 
 *  where keys of `instance` are used as instance IDs as well as agent IDs
 */
export type SugaredConductorConfig = ConductorConfigCommon & {
  instances: ObjectS<DnaConfig>,
}

export type AgentConfig = {
  id: string,
  name: string,
  keystore_file: string,
  public_address: string,
  test_agent: boolean,
}

export type DnaConfig = {
  id: string,
  file: string,
  hash?: string,
  uuid?: string,
}

export type InstanceConfig = {
  id: string
  agent: AgentConfig
  dna: DnaConfig
}

export type BridgeConfig = {
  handle: string
  caller_id: string
  callee_id: string
}

export type DpkiConfig = {
  instance_id: string,
  init_params: any,
}

/** Something "killable" */
export interface Mortal {
  kill(signal?: string): void
}