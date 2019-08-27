import { Signal } from '@holochain/hachiko'

import { notImplemented } from './common'
import { Conductor } from './conductor'
import { ConductorConfig, GenConfigArgs, SpawnConductorFn } from './types';
import { getConfigPath } from './config';
import logger from './logger';

type ConstructorArgs = {
  name: string,
  genConfigArgs: GenConfigArgs,
  onSignal: (Signal) => void,
}

/**
 * Representation of a Conductor user.
 * An Actor is essentially a wrapper around a conductor config that was generated,
 * and the possible reference to a conductor which is running based on that config.
 * The Actor can spawn or kill a conductor based on the generated config.
 * Actors are the main interface for writing scenarios.
 */
export class Actor {

  name: string
  onSignal: (Signal) => void

  _conductor: Conductor | null
  _genConfigArgs: GenConfigArgs
  _spawnConductor: SpawnConductorFn

  constructor({ name, genConfigArgs, onSignal, spawnConductor }) {
    this.name = name
    this.onSignal = onSignal
    this._genConfigArgs = genConfigArgs
    this._spawnConductor = spawnConductor
    this._conductor = null
  }

  admin = (method, params) => {
    this._conductorGuard()
    this._conductor!.callAdmin(method, params)
  }

  call = (instanceId, zome, fn, params) => {
    this._conductor!.callZome(instanceId, zome, fn, params)
  }

  spawn = async () => {
    const path = getConfigPath(this._genConfigArgs.configDir)
    const handle = this._spawnConductor(this.name, path)
    this._conductor = new Conductor({
      name: this.name,
      handle,
      onSignal: this.onSignal.bind(this),
      ...this._genConfigArgs
    })
    await this._conductor.initialize()
  }

  kill = () => {
    if (this._conductor) {
      this._conductor.kill()
    } else {
      logger.warn(`Attempted to kill conductor '${this.name}' twice`)
    }
  }

  _conductorGuard = () => {
    if (this._conductor === null) {
      throw new Error("Attempted conductor action when no conductor is running! You must `.spawn()` first")
    }
  }
}