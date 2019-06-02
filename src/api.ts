import {Waiter} from '@holochain/hachiko'

import {delay} from './util'

export class ScenarioApi {

  waiter: Waiter

  constructor (waiter: Waiter) {
    this.waiter = waiter
  }

  consistent = (instances?) => new Promise(resolve => this.waiter.registerCallback({
    nodes: instances ? instances.map(i => i.id) : null,
    callback: resolve,
  }))
}
