const fs = require('fs').promises
const path = require('path')

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
      await fs.writeFile(getConfigPath(configDir), configToml)

      const player = new Player({
        name,
        onSignal: () => 'TODO: hook up consistency signals',
        genConfigArgs,
        spawnConductor: this._orchestrator._spawnConductor
      })
      if (start) {
        await player.spawn()
      }
      this._players.push(player)
      return player
    }))
  }

  consistency = (players: Array<Player>): Promise<void> => new Promise((resolve, reject) => {
    logger.warn("Waiting 5 seconds instead of real consistency check")
    setTimeout(resolve, 5000)
    // this._waiter.registerCallback({
    //   nodes: players ? players.map(i => i.id) : null,
    //   resolve,
    //   reject,
    // })
  })

  /**
   * Only called externally when there is a test failure, 
   * to ensure that conductors have been properly cleaned up
   */
  _cleanup = () => {
    this._players.forEach(player => player.kill())
  }

}