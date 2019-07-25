/**
 * ConductorFactory:
 * The class representing
 */

import {Signal} from '@holochain/hachiko'
import {ConductorManaged} from './conductor-managed'
import logger from './logger'
import * as T from './types'
const getPort = require('get-port')

const ADMIN_INTERFACE_ID = 'admin-interface'


export interface ScenarioConductor {
  name: string
  spawn ()
  kill ()
}

type ConstructorArgs = {
  name: string,
  spawnConductor: T.SpawnConductorFn,
  genConfig: T.GenConfigFn,
  testConfig: T.ConductorConfig,
  onSignal: (Signal) => void,
}

export class ConductorFactory implements ScenarioConductor {
  name: string
  configData: T.GenConfigReturn | null
  conductor: ConductorManaged | null
  lastConductor: ConductorManaged | null
  spawnConductor: T.SpawnConductorFn
  genConfig: T.GenConfigFn
  testConfig: T.ConductorConfig
  testPort: number
  onSignal: (Signal) => void
  firstSpawn: boolean  // Each test starts with firstSpawn === true

  constructor (args: ConstructorArgs) {
    const {
      name,
      spawnConductor,
      genConfig,
      testConfig,
      onSignal,
    } = args
    this.name = name
    this.spawnConductor = spawnConductor
    this.genConfig = genConfig
    this.testConfig = testConfig
    this.onSignal = onSignal
    this.firstSpawn = true
    this.conductor = null
    this.lastConductor = null
  }

  getArbitraryInterfacePort = async () => {
    const port = await getPort()
    // const port = await getPort({port: getPort.makeRange(5555, 5999)})
    logger.info("using port, %n", port)
    return port
  }

  async spawn (): Promise<void> {
    if (!this.configData) {
      throw new Error(`Attempted to spawn conductor '${this.name}' before config was generated`)
    } else if (this.conductor) {
      throw new Error(`Attempted to spawn conductor '${this.name}' twice`)
    }
    const {configPath, adminUrl} = this.configData
    const handle = await this.spawnConductor(this.name, configPath)
    if (!this.testPort) {
      this.testPort = await this.getArbitraryInterfacePort()
    }

    if (this.firstSpawn) {
      this.conductor = new ConductorManaged({
        name: this.name,
        adminInterfaceUrl: adminUrl,
        testPort: this.testPort,
        configPath: configPath,
        onSignal: this.onSignal,
        handle: handle,
      })
      logger.debug("ConductorFactory :: spawn :: spawned")
      await this.conductor.initialize()
      logger.debug("ConductorFactory :: spawn :: initialized")
      await this.conductor.prepareRun(this.testConfig)
      logger.debug("ConductorFactory :: spawn :: run")
    } else {
      this.conductor = this.lastConductor!
      this.conductor.handle = handle
      this.lastConductor = null
      logger.debug("ConductorFactory :: spawn :: spawned")
      await this.conductor.initialize()
    }
    await this.conductor.makeConnections(this.testConfig)
    if (this.firstSpawn) {
      logger.debug("makeConnections :: startInstances")
      await this.conductor.startInstances(this.testConfig)
    }
    this.firstSpawn = false
    logger.debug("ConductorFactory :: spawn :: makeConnections")
  }

  async kill () {
    if (!this.conductor) {
      throw new Error(`Attempted to kill conductor '${this.name}' before spawning`)
    }
    this.lastConductor = this.conductor
    await this.conductor.kill()
    this.conductor = null
  }

  async setup (index: number) {
    this.configData = await this.genConfig(true, index)
    const {configPath, adminUrl} = this.configData
    logger.debug("genConfig data:")
    logger.debug("configPath: %s", configPath)
    logger.debug("adminUrl: %s", adminUrl)
    if (!configPath || !adminUrl) {
      throw new Error('getConfig did not return valid values')
    }
  }

  async cleanup () {
    try {
      if (this.conductor) {
        await this.conductor.cleanupRun(this.testConfig)
        await this.kill()
      }
    } catch (e) {
      console.error("Caught something during factory cleanup:")
      console.error(e)
    }
    this.configData = null
  }
}

// export const conductorFactoryProxy = (original: ConductorFactory) => new Proxy(original, {
//   get (obj, prop) {
//     if (typeof prop === 'string' && !(obj[prop])) {
//       if (obj.conductor) {
//         if (obj.conductor.instanceMap[prop]) {
//           return obj.conductor.instanceMap[prop]
//         } else {
//           throw new Error(`Unknown instance '${prop}' on conductor '${obj.name}'`)
//         }
//       } else {
//         throw new Error(`Can't access '${prop}' on conductor object, as no conductor is spawned`)
//       }
//     } else {
//       return obj[prop]
//     }
//     // if (!(name in obj)) {
//     //   if (!obj.conductor) {
//     //     console.log(name, obj)
//     //     throw new Error("No conductor running.")
//     //   }
//     //   return obj.conductor.instanceMap[name]
//     // } else {
//     //   return obj[name]
//     // }
//   }
// })
