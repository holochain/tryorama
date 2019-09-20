const _ = require('lodash')
import { ScenarioApi } from "./api"
import * as t from "io-ts"
import { reporter } from 'io-ts-reporters'
import { ThrowReporter } from "io-ts/lib/ThrowReporter"
import { ChildProcess } from 'child_process';
import logger from "./logger";

export const decodeOrThrow = (validator, value) => {
  const result = validator.decode(value)
  const errors = reporter(result)
  if (errors.length > 0) {
    const msg = `Tried to use an invalid value for a complex type and found the following problems:\n    - ${errors.join("\n    - ")}`
    logger.error(msg)
    throw new Error(msg)
  }
  return result
}

export type ObjectN<V> = { [name: number]: V }
export type ObjectS<V> = { [name: string]: V }

export type SpawnConductorFn = (name: string, configPath: string) => Promise<ChildProcess>

export type ScenarioFn = (s: ScenarioApi) => Promise<void>

export type GenConfigFn = (args: GenConfigArgs) => Promise<string>
export type GenConfigArgs = {
  conductorName: string,
  configDir: string,
  uuid: string,
  adminPort: number,
  zomePort: number,
}

export const AgentConfigV = t.intersection([
  t.type({
    id: t.string,
    name: t.string,
    keystore_file: t.string,
    public_address: t.string,
  }),
  t.partial({
    test_agent: t.boolean,
  })
])
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

export const NetworkModeV = t.union([
  t.literal('n3h'),
  t.literal('memory'),
  t.literal('websocket'),
])
export type NetworkMode = t.TypeOf<typeof NetworkModeV>

export const NetworkConfigV = t.union([
  NetworkModeV,
  t.record(t.string, t.any),  // TODO: could make this actually match the shape of networking
])
export type NetworkConfig = t.TypeOf<typeof NetworkConfigV>

export const LoggerConfigV = t.union([
  t.boolean,
  t.record(t.string, t.any),
])
export type LoggerConfig = t.TypeOf<typeof LoggerConfigV>

const ConductorConfigCommonV = t.partial({
  bridges: t.array(BridgeConfigV),
  dpki: DpkiConfigV,
  network: NetworkConfigV,
  logger: LoggerConfigV,
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

/** For situations where we can accept either flavor of config */
export type AnyConductorConfig = EitherConductorConfig | GenConfigFn

export const GlobalConfigV = t.type({
  network: NetworkConfigV,
  logger: LoggerConfigV,
})
export type GlobalConfig = t.TypeOf<typeof GlobalConfigV>


/** Something "killable" */
export interface Mortal {
  kill(signal?: string): void
}