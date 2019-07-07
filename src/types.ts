import {ChildProcess} from 'child_process'
import {ScenarioApi} from './api'
import {ScenarioInstanceRef} from './instance'
import {ConductorManaged} from './conductor-managed'

export type ScenarioFnCustom = (s: object, ins: {[id: string]: any}) => Promise<any>
export type ScenarioFn = (s: ScenarioApi, ins: {[id: string]: ScenarioInstanceRef}) => Promise<any>

export type ExternalConductor = {
  url: string,
  name: string,
}

export type ConductorConfig = {
  instances: Array<InstanceConfig>,
  bridges?: Array<BridgeConfig>,
}

export type ConductorConfigShorthand = {
  instances: {[id: string]: DnaConfig},
  bridges?: Array<BridgeConfig>,
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

export type InstanceConfigShorthand = {[agent: string]: DnaConfig}

export type BridgeConfig = {
  handle: string
  caller_id: string
  callee_id: string
}

export type ObjectN<V> = {[name: number]: V}
export type ObjectS<V> = {[name: string]: V}

export type GenConfigFn = (debug: boolean, index: number) => Promise<GenConfigReturn>
export type SpawnConductorFn = (name: string, configPath: string) => Promise<Mortal>

export type GenConfigReturn = {
  configPath: string,
  adminUrl: string,
}

export interface Mortal {
  kill(): Promise<void>
}
