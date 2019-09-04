const _ = require('lodash')

import { Signal, DnaId } from '@holochain/hachiko'

import { notImplemented } from './common'
import { Conductor } from './conductor'
import { GenConfigArgs, SpawnConductorFn, ObjectS } from './types';
import { getConfigPath } from './config';
import { makeLogger } from './logger';

type ConstructorArgs = {
  name: string,
  genConfigArgs: GenConfigArgs,
  onSignal: ({ instanceId: string, signal: Signal }) => void,
  onJoin: () => void,
  onLeave: () => void,
  spawnConductor: SpawnConductorFn,
}

type InstanceInfo = {
  agentAddress: string,
  dnaAddress: string,
}

/**
 * Representation of a Conductor user.
 * A Player is essentially a wrapper around a conductor config that was generated,
 * and the possible reference to a conductor which is running based on that config.
 * The Player can spawn or kill a conductor based on the generated config.
 * Players are the main interface for writing scenarios.
 */
export class Player {

  name: string
  logger: any
  onJoin: () => void
  onLeave: () => void
  onSignal: ({ instanceId: string, signal: Signal }) => void

  _conductor: Conductor | null
  _dnaIds: Array<DnaId>
  _genConfigArgs: GenConfigArgs
  _instanceInfo: ObjectS<InstanceInfo>
  _spawnConductor: SpawnConductorFn

  constructor({ name, genConfigArgs, onJoin, onLeave, onSignal, spawnConductor }: ConstructorArgs) {
    this.name = name
    this.logger = makeLogger(`player ${name}`)
    this.onJoin = onJoin
    this.onLeave = onLeave
    this.onSignal = onSignal
    this._conductor = null
    this._genConfigArgs = genConfigArgs
    this._instanceInfo = {}
    this._spawnConductor = spawnConductor
  }

  admin = (method, params) => {
    this._conductorGuard()
    return this._conductor!.callAdmin(method, params)
  }

  call = (instanceId, zome, fn, params) => {
    this._conductorGuard()
    return this._conductor!.callZome(instanceId, zome, fn, params)
  }

  info = (instanceId) => {
    this._conductorGuard()
    return _.clone(this._instanceInfo[instanceId])
  }

  spawn = async () => {
    if (this._conductor) {
      this.logger.warn(`Attempted to spawn conductor '${this.name}' twice!`)
      return
    }

    await this.onJoin()
    this.logger.debug("spawning")
    const path = getConfigPath(this._genConfigArgs.configDir)
    const handle = await this._spawnConductor(this.name, path)

    this.logger.debug("spawned")
    this._conductor = new Conductor({
      name: this.name,
      handle,
      onSignal: this.onSignal.bind(this),
      ...this._genConfigArgs
    })

    this.logger.debug("initializing")
    await this._conductor.initialize()
    await this._setInstanceInfo()
    this.logger.debug("initialized")
  }

  kill = async (): Promise<void> => {
    if (this._conductor) {
      const c = this._conductor
      this._conductor = null
      this.logger.debug("Killing...")
      await c.kill('SIGINT')
      this.logger.debug("Killed.")
      await this.onLeave()
    } else {
      this.logger.warn(`Attempted to kill conductor '${this.name}' twice`)
    }
  }

  _setInstanceInfo = async () => {
    const agentList = await this._conductor!.callAdmin("admin/agent/list", {})
    const dnaList = await this._conductor!.callAdmin("admin/dna/list", {})
    const instanceList = await this._conductor!.callAdmin("admin/instance/list", {})
    instanceList.forEach(i => {
      const agent = agentList.find(a => a.id === i.agent)
      const dna = dnaList.find(d => d.id === i.dna)
      if (!agent) {
        throw new Error(`Instance '${i.id}' refers to nonexistant agent id '${i.agent}'`)
      }
      if (!dna) {
        throw new Error(`Instance '${i.id}' refers to nonexistant dna id '${i.dna}'`)
      }
      this._instanceInfo[i.id] = {
        agentAddress: agent.public_address,
        dnaAddress: dna.hash,
      }
    })
  }

  _conductorGuard = () => {
    if (this._conductor === null) {
      this.logger.error("Attempted conductor action when no conductor is running! You must `.spawn()` first")
      throw new Error("Attempted conductor action when no conductor is running! You must `.spawn()` first")
    }
  }
}