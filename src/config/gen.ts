import * as T from '../types'
import _ from 'lodash'
import path from 'path'

// default networking is for local Quic (no bootstrap) so that
// shareAllNodes works out of the box
const defaultCommonConfig = {
  network: {
    transport_pool: [{
      type: T.TransportConfigType.Quic,
    }],
  }
}

export const gen = ( commonConfig: T.CommonConfig = {} ): T.ConfigSeed => (
  args: T.ConfigSeedArgs
): T.RawConductorConfig => {
  const { configDir, adminInterfacePort, uuid } = args
  const specific: T.RawConductorConfig = {
    environment_path: configDir,
    admin_interfaces: [
      {
        driver: {
          type: 'websocket',
          port: adminInterfacePort,
        },
      },
    ],
    network: commonConfig.network
  }

  return _.merge({}, specific, defaultCommonConfig)
}

export const getConfigPath = (configDir: string) =>
  path.join(configDir, 'conductor-config.yaml')
