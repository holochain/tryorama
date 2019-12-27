import * as _ from 'lodash'

import { Signal, DnaId } from '@holochain/hachiko'

import { Conductor, CallZomeFunc, CallAdminFunc } from './conductor'
import { Instance } from './instance'
import { ConfigSeedArgs, SpawnConductorFn, ObjectS, ObjectN } from './types';
import { getConfigPath } from './config';
import { makeLogger } from './logger';
import { unparkPort } from './config/get-port-cautiously'

type ConstructorArgs = {
  name: string,
  configDir: string,
  interfacePort: number,
  onSignal: ({ instanceId: string, signal: Signal }) => void,
  onJoin: () => void,
  onLeave: () => void,
  onActivity: () => void,
  spawnConductor: SpawnConductorFn,
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
  onActivity: () => void

  _conductor: Conductor | null
  _instances: ObjectS<Instance> | ObjectN<Instance>
  _dnaIds: Array<DnaId>
  _configDir: string
  _interfacePort: number
  _spawnConductor: SpawnConductorFn

  constructor({ name, configDir, interfacePort, onJoin, onLeave, onSignal, onActivity, spawnConductor }: ConstructorArgs) {
    this.name = name
    this.logger = makeLogger(`player ${name}`)
    this.onJoin = onJoin
    this.onLeave = onLeave
    this.onSignal = onSignal
    this.onActivity = onActivity

    this._conductor = null
    this._instances = {}
    this._configDir = configDir
    this._interfacePort = interfacePort
    this._spawnConductor = spawnConductor
  }

  admin: CallAdminFunc = async (method, params): Promise<any> => {
    this._conductorGuard(`admin(${method}, ${JSON.stringify(params)})`)
    return this._conductor!.callAdmin(method, params)
  }

  call: CallZomeFunc = async (...args): Promise<any> => {
    const [instanceId, zome, fn, params] = args
    if (args.length != 4 || typeof instanceId !== 'string' || typeof zome !== 'string' || typeof fn !== 'string') {
      throw new Error("player.call() must take 4 arguments: (instanceId, zomeName, funcName, params)")
    }
    this._conductorGuard(`call(${instanceId}, ${zome}, ${fn}, ${JSON.stringify(params)})`)
    return this._conductor!.callZome(instanceId, zome, fn, params)
  }

  stateDump = (id: string): Promise<any> => this.instance(id).stateDump()

  /**
   * Get a particular Instance of this conductor.
   * The reason for supplying a getter rather than allowing direct access to the collection
   * of instances is to allow middlewares to modify the instanceId being retrieved,
   * especially for singleConductor middleware
   */
  instance = (instanceId) => {
    this._conductorGuard(`instance(${instanceId})`)
    return _.cloneDeep(this._instances[instanceId])
  }

  instances = (filterPredicate?): Array<Instance> => {
    return _.flow(_.values, _.filter(filterPredicate), _.cloneDeep)(this._instances)
  }

  /**
   * @deprecated in 0.1.2
   * Use `player.instance(instanceId)` instead
   */
  info = (instanceId) => this.instance(instanceId)

  /**
   * Spawn can take a function as an argument, which allows the caller
   * to do something with the child process handle, even before the conductor
   * has fully started up. Otherwise, by default, you will have to wait for
   * the proper output to be seen before this promise resolves.
   */
  spawn = async (spawnArgs: any) => {
    if (this._conductor) {
      this.logger.warn(`Attempted to spawn conductor '${this.name}' twice!`)
      return
    }

    await this.onJoin()
    this.logger.debug("spawning")
    const conductor = await this._spawnConductor(this, spawnArgs)

    this.logger.debug("spawned")
    this._conductor = conductor

    this.logger.debug("initializing")
    await this._conductor.initialize()
    await this._setInstances()
    this.logger.debug("initialized")
  }

  kill = async (signal = 'SIGINT'): Promise<boolean> => {
    if (this._conductor) {
      const c = this._conductor
      this._conductor = null
      this.logger.debug("Killing...")
      await c.kill(signal)
      this.logger.debug("Killed.")
      await this.onLeave()
      return true
    } else {
      this.logger.warn(`Attempted to kill conductor '${this.name}' twice`)
      return false
    }
  }

  /** Runs at the end of a test run */
  cleanup = async (signal = 'SIGINT'): Promise<boolean> => {
    if (this._conductor) {
      await this.kill(signal)
      unparkPort(this._interfacePort)
      return true
    } else {
      unparkPort(this._interfacePort)
      return false
    }
  }

  _setInstances = async () => {
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
      this._instances[i.id] = new Instance({
        id: i.id,
        agentAddress: agent.public_address,
        dnaAddress: dna.hash,
        callAdmin: (method, params) => this._conductor!.callAdmin(method, params),
        callZome: (zome, fn, params) => this._conductor!.callZome(i.id, zome, fn, params)
      })
    })
  }

  _conductorGuard = (context) => {
    if (this._conductor === null) {
      const msg = `Attempted conductor action when no conductor is running! You must \`.spawn()\` first.\nAction: ${context}`
      this.logger.error(msg)
      throw new Error(msg)
    } else {
      this.logger.debug(context)
    }
  }

}
