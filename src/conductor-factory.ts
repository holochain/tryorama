/**
 * ConductorFactory:
 * The class representing
 */

import {ConductorManaged} from './conductor-managed'
import * as T from './types'

const ADMIN_INTERFACE_ID = 'admin-interface'


export interface ScenarioConductor {
  name: string
  spawn ()
  kill ()
}

type ConstructorArgs = {
  spawnConductor: T.SpawnConductorFn,
  genConfig: T.GenConfigFn,
  testConfig: T.ConductorConfig
}

export class ConductorFactory implements ScenarioConductor {
  name: string
  configData: T.GenConfigReturn | null
  conductor: ConductorManaged | null
  spawnConductor: T.SpawnConductorFn
  genConfig: T.GenConfigFn
  testConfig: T.ConductorConfig
  firstSpawn: boolean  // Each test starts with firstSpawn === true

  constructor (args: ConstructorArgs) {
    const {
      spawnConductor,
      genConfig,
      testConfig
    } = args
    this.spawnConductor = spawnConductor
    this.genConfig = genConfig
    this.testConfig = testConfig
    this.firstSpawn = true
  }

  async spawn () {
    if (!this.configData) {
      throw new Error(`Attempted to spawn conductor '${this.name}' before config was generated`)
    } else if (this.conductor) {
      throw new Error(`Attempted to spawn conductor '${this.name}' twice`)
    }
    this.conductor = await this.spawnConductor(this.configData.configPath)
    if (this.firstSpawn) {
      await this.conductor.prepareRun(this.testConfig)
      this.firstSpawn = false
    }
  }

  async kill () {
    if (!this.conductor) {
      throw new Error(`Attempted to kill conductor '${this.name}' before spawning`)
    }
    await this.conductor.kill()
    this.conductor = null
  }

  async setup () {
    this.configData = this.genConfig(true)
  }

  async cleanup () {
    try {
      await this.conductor!.cleanupRun(this.testConfig)
      await this.kill()
    } catch (e) {}
    this.configData = null
  }
}

export const conductorFactoryProxy = original => new Proxy(original, {
  get (factory, name) {
    if (!factory.conductor) {
      throw new Error("No conductor running.")
    }
    if (!(name in factory)) {
      return factory.conductor.instanceMap[name]
    } else {
      return factory[name]
    }
  }
})
