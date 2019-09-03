import _ from 'lodash'
import { ScenarioApi } from "./api"
import * as t from "io-ts"

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

export const AgentConfigV = t.type({
  id: t.string,
  name: t.string,
  keystore_file: t.string,
  public_address: t.string,
  test_agent: t.boolean,
})
export type AgentConfig = t.TypeOf<typeof AgentConfigV>

export const DnaConfigV = t.intersection([
  t.type({
    id: t.string,
    file: t.string,
  }),
  t.partial({
    hash: t.string,
    uuid: t.string,
  })
])
export type DnaConfig = t.TypeOf<typeof DnaConfigV>

export const InstanceConfigV = t.type({
  id: t.string,
  agent: AgentConfigV,
  dna: DnaConfigV,
})
export type InstanceConfig = t.TypeOf<typeof InstanceConfigV>

export const BridgeConfigV = t.type({
  handle: t.string,
  caller_id: t.string,
  callee_id: t.string,
})
export type BridgeConfig = t.TypeOf<typeof BridgeConfigV>

export const DpkiConfigV = t.type({
  instance_id: t.string,
  init_params: t.UnknownRecord,
})
export type DpkiConfig = t.TypeOf<typeof DpkiConfigV>

const ConductorConfigCommonV = t.partial({
  bridges: t.array(BridgeConfigV),
  dpki: DpkiConfigV,
})

/** Base representation of a Conductor */
export const ConductorConfigV = t.intersection([
  ConductorConfigCommonV,
  t.type({
    instances: t.array(InstanceConfigV),
  })
])
export type ConductorConfig = t.TypeOf<typeof ConductorConfigV>

/** Shorthand representation of a Conductor, 
 *  where keys of `instance` are used as instance IDs as well as agent IDs
 */
export const SugaredConductorConfigV = t.intersection([
  ConductorConfigCommonV,
  t.type({
    instances: t.record(t.string, DnaConfigV),
  })
])
export type SugaredConductorConfig = t.TypeOf<typeof SugaredConductorConfigV>

/** For situations where we can accept either flavor of config */
export const EitherConductorConfigV = t.union([ConductorConfigV, SugaredConductorConfigV])
export type EitherConductorConfig = t.TypeOf<typeof EitherConductorConfigV>

/** Something "killable" */
export interface Mortal {
  kill(signal?: string): void
}