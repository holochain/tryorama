import _ from 'lodash'
const fs = require('fs').promises
const path = require('path')
const TOML = require('@iarna/toml')

import { Waiter } from '@holochain/hachiko'
import { GenConfigFn, ObjectS } from "./types"
import { Player } from "./player"
import logger from './logger';
import { Orchestrator } from './orchestrator';
import { promiseSerial } from './util';
import { getConfigPath } from './config';


export class ScenarioApi {

  description: string

  _players: Array<Player>
  _uuid: string
  _orchestrator: Orchestrator
  _waiter: Waiter

  constructor(description: string, orchestrator: Orchestrator, uuid: string) {
    this.description = description
    this._players = []
    this._uuid = uuid
    this._orchestrator = orchestrator
  }

  conductors = (fns: ObjectS<GenConfigFn>, start?: boolean): Promise<ObjectS<Player>> => {
    return promiseSerial(Object.entries(fns).map(async ([name, genConfig]) => {
      const genConfigArgs = await this._orchestrator._genConfigArgs()
      const { configDir } = genConfigArgs
      const configToml = await genConfig(genConfigArgs, this._uuid)
      const configJson = TOML.parse(configToml)
      const { dnas, instances } = configJson

      await fs.writeFile(getConfigPath(configDir), configToml)

      const player = new Player({
        name,
        genConfigArgs,
        spawnConductor: this._orchestrator._spawnConductor,
        onJoin: () => dnas.forEach(dna => this._waiter.addNode(dna.id, name)),
        onLeave: () => dnas.forEach(dna => this._waiter.removeNode(dna.id, name)),
        onSignal: ({ instanceId, signal }) => {
          const instance = instances.find(c => c.id === instanceId)
          const dnaId = instance!.dna.id
          this._waiter.handleObservation({
            dna: dnaId,
            node: name,
            signal
          })
        },
      })

      if (start) {
        await player.spawn()
      }
      this._players.push(player)
      return player
    }))
  }

  consistency = (players?: Array<Player>): Promise<void> => new Promise((resolve, reject) => {
    if (players) {
      throw new Error("Calling `consistency` with parameters is currently unsupported. See https://github.com/holochain/hachiko/issues/10")
    }
    this._waiter.registerCallback({
      // nodes: players ? players.map(p => p.name) : null,
      nodes: null,
      resolve,
      reject,
    })
  })

  /**
   * Only called externally when there is a test failure, 
   * to ensure that conductors have been properly cleaned up
   */
  _cleanup = (): Promise<void> => {
    return Promise.all(
      this._players.map(player => player.kill())
    ).then(() => { })
  }

}