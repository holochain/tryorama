import { notImplemented } from './common'
import { Conductor } from './conductor'
import { ConductorConfig, GenConfigArgs, SpawnConductorFn } from './types';
import { getConfigPath } from './config';


/**
 * Representation of a Conductor user.
 * An Actor is essentially a wrapper around a conductor config that was generated,
 * and the possible reference to a conductor which is running based on that config.
 * The Actor can spawn or kill a conductor based on the generated config.
 * Actors are the main interface for writing scenarios.
 */
export class Actor {

  name: string

  _conductor: Conductor
  _genConfigArgs: GenConfigArgs
  _spawnConductor: SpawnConductorFn

  constructor(name: string, genConfigArgs: GenConfigArgs) {
    this.name = name
    this._genConfigArgs = genConfigArgs
    this._conductor = new Conductor()
  }

  admin = (method, params) => {
    this._conductor.callAdmin(method, params)
  }

  call = (instanceId, zome, fn, params) => {
    this._conductor.callZome(instanceId, zome, fn, params)
  }

  spawn = () => {
    const path = getConfigPath(this._genConfigArgs.configDir)
    this._spawnConductor(this.name, path)
  }

  kill = () => {
    throw notImplemented
  }
}