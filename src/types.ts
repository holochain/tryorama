
import {ScenarioApi} from './api'
import {DnaInstance} from './instance'

export type ScenarioFnCustom = (s: object, ins: {[id: string]: any}) => Promise<any>
export type ScenarioFn = (s: ScenarioApi, ins: {[id: string]: DnaInstance}) => Promise<any>


export type AgentConfig = {
  id: string,
  name: string,
}

export type DnaConfig = {
  id: string,
  path: string,
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
