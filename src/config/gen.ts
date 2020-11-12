import * as T from '../types'
import _ from 'lodash'
import path from 'path'

const defaultCommonConfig = {
  // what goes in here?
}

export const gen = (): T.ConfigSeed => (
  args: T.ConfigSeedArgs
): T.RawConductorConfig => {
  const { configDir, adminInterfacePort, uuid } = args

  const specific: any = {
    environment_path: configDir,
    admin_interfaces: [
      {
        driver: {
          type: 'websocket',
          port: 8000,
        },
      },
    ],
  }

  return _.merge({}, specific, defaultCommonConfig)
}

export const getConfigPath = (configDir: string) =>
  path.join(configDir, 'conductor-config.yaml')
