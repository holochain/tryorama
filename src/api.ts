import { Waiter } from '@holochain/hachiko'
import { ConductorConfig } from "./types"
import { Actor } from "./actor"
import logger from './logger';


export class ScenarioApi {

  _waiter: Waiter
  description: string

  constructor(description: string) {
    this.description = description
  }

  initialize = (configs: Array<ConductorConfig>, start?: boolean): Promise<Array<Actor>> => {
    return Promise.all(configs.map(async config => {
      const actor = new Actor(config)
      if (start) {
        await actor.start()
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