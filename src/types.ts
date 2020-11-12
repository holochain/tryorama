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

export type ConfigSeedArgs = PartialConfigSeedArgs & {
  scenarioName: string,
  playerName: string,
  uuid: string,
}

// export type PlayerConfigs = ObjectS<PlayerConfig>
export type PlayerConfig = [ConfigSeed, StartupArg?]
// if undefined, default to true
// if boolean, use that
// if InstallHapps, startup and then immediately install these happs
export type StartupArg = undefined | boolean | InstallHapps
export type InstallHapps = AgentHapp[]
export type AgentHapp = DnaPath[]
export type DnaPath = string

// the mirror of PlayerConfigs, once all up and running
// export type PlayerResults = PlayerResult[]
// the mirror of PlayerConfig
export type PlayerResult = [Player, InstalledHapps]
// the mirror of InstallHapps
export type InstalledHapps = InstalledAgentHapp[]
// the mirror of AgentHapp
export type InstalledAgentHapp = Cell[]

// export type MachineConfigs = ObjectS<PlayerConfigs>

export const adminWsUrl = ({ urlBase, port }) => `${urlBase}:${port}`

export interface RawConductorConfig {
  environment_path: string,
  use_dangerous_test_keystore: boolean,
  signing_service_uri?: string,
  encryption_service_uri?: string,
  decryption_service_uri?: string,
  keystore_path?: string,
  // TODO:
  // passphrase_service?: PassphraseServiceConfig,
  // admin_interfaces?: Array<AdminInterfaceConfig>
  // network?: KitsuneP2pConfig,
}

export type KillFn = (signal?: string) => Promise<void>

