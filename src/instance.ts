import * as colors from 'colors'

import logger from './logger'
import * as T from './types'

export class DnaInstance {

  id: string
  agentAddress: string | null
  dnaAddress: string | null
  callZome: any
  signals: Array<any>

  constructor (instanceId, callZome) {
    this.id = instanceId
    this.agentAddress = null
    this.dnaAddress = null
    this.callZome = callZome
    this.signals = []  // gets populated by onSignal via Conductor.connectSignals
  }

  // internally calls `this.conductor.call`
  async call (zome, fn, params) {
    const result = await this.callZome(this.id, zome, fn)(params)
    logger.debug(colors.blue.inverse("zome call"), {id: this.id, zome, fn, params})
    try {
      return JSON.parse(result)
    } catch (e) {
      logger.error('Could not JSON.parse zome function return value: ', e)
      throw e
    }
  }
}

export type InstanceMap = T.ObjectS<DnaInstance>
export type ConductorMap = T.ObjectS<InstanceMap>
