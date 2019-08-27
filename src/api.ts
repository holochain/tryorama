const fs = require('fs').promises
const path = require('path')

import { Waiter } from '@holochain/hachiko'
import { GenConfigFn } from "./types"
import { Actor } from "./actor"
import logger from './logger';
import { Orchestrator } from './orchestrator';
import { promiseSerial } from './util';
import { getConfigPath } from './config';


export class ScenarioApi {

  description: string

  _orchestrator: Orchestrator
  _waiter: Waiter

  constructor(description: string, orchestrator: Orchestrator) {
    this.description = description
    this._orchestrator = orchestrator
  }

  conductors = (fns: Array<GenConfigFn>, start?: boolean): Promise<Array<Actor>> => {
    return promiseSerial(fns.map(async (genConfig, i) => {
      const genConfigArgs = await this._orchestrator._genConfigArgs()
      const { configDir } = genConfigArgs
      const configToml = genConfig(genConfigArgs)
      await fs.writeFile(getConfigPath(configDir), configToml)

      const actor = new Actor({
        name: 'TODO',
        onSignal: () => 'TODO',
        genConfigArgs,
        spawnConductor: this._orchestrator._spawnConductor
      })
      if (start) {
        await actor.spawn()
      }
      return actor
    }))
  }

  consistency = (actors: Array<Actor>): Promise<void> => new Promise((resolve, reject) => {
    logger.warn("Waiting 5 seconds instead of real consistency check")
    setTimeout(resolve, 5000)
    // this._waiter.registerCallback({
    //   nodes: actors ? actors.map(i => i.id) : null,
    //   resolve,
    //   reject,
    // })
  })

}