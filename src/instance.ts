import * as colors from 'colors'

import logger from './logger'
import * as T from './types'
import {Conductor} from './conductor'

export class ScenarioInstanceRef {

  id: string
  agentAddress: string | null
  dnaAddress: string | null
  callAdmin: any  // TODO: remove
  callZome: any
  signals: Array<any>

  constructor ({instanceId, callZome, callAdmin}) {
    this.id = instanceId
    this.agentAddress = null
    this.dnaAddress = null
    this.callAdmin = callAdmin
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

export type InstanceMap = T.ObjectS<ScenarioInstanceRef>

export type ConductorMap = T.ObjectS<InstanceMap>
