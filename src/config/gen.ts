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
  const keystorePath = path.join(configDir, 'keystore');
  
  // don't put any keys on this object that you want to fall back to defaults
  const specific: T.RawConductorConfig = {
    environment_path: configDir,
    keystore_path: keystorePath, 
    admin_interfaces: [
      {
        driver: {
          type: 'websocket',
          port: adminInterfacePort,
        },
      },
    ],
    ...(commonConfig.network ? { network: commonConfig.network } : {})
  }

  // apply from left to right, in order of precedence
  // so this will override defaults with specifically set values
  // https://lodash.com/docs/4.17.15#merge
  return _.merge({}, defaultCommonConfig, specific)
}

export const getConfigPath = (configDir: string) =>
  path.join(configDir, 'conductor-config.yml')
