import { notImplemented } from './common'
import { Conductor } from './conductor'
import { ConductorConfig } from './types';


export class Actor {

  _conductor: Conductor

  constructor(config: ConductorConfig) {
    this._conductor = new Conductor(config)
  }

  admin = (method, params) => {
    this._conductor.callAdmin(method, params)
  }

  call = (instanceId, zome, fn, params) => {
    this._conductor.callZome(instanceId, zome, fn, params)
  }

  start = () => {
    throw notImplemented
  }

  kill = () => {
    throw notImplemented
  }
}