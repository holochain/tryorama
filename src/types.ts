import { ScenarioApi } from "./api";

export type ObjectN<V> = { [name: number]: V }
export type ObjectS<V> = { [name: string]: V }

export type SpawnConductorFn = (name: string, configPath: string) => Promise<Mortal>
export type GenConfigFn = (debug: boolean, index: number) => Promise<GenConfigReturn>
export type GenConfigReturn = {
  configPath: string,
  adminUrl: string,
}

export type ScenarioFn = (s: ScenarioApi) => Promise<void>

export type ExternalConductor = {
  url: string,
  name: string,
}

/** Base representation of a Conductor */
export type ConductorConfig = {
  instances: Array<InstanceConfig>,
  bridges?: Array<BridgeConfig>,
  dpki?: DpkiConfig,
}

/** Shorthand representation of a Conductor, 
 *  where keys of `instance` are used as instance IDs as well as agent IDs
 */
export type SugaredConductorConfig = {
  instances: ObjectS<DnaConfig>,
  bridges?: Array<BridgeConfig>,
  dpki?: DpkiConfig,
}

export type AgentConfig = {
  id: string,
  name: string,
}

export type DnaConfig = {
  id: string,
  path: string,
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
  kill(signal?: any): Promise<void>
}