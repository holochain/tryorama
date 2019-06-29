import {Waiter} from '@holochain/hachiko'

import {delay} from './util'
import {ConductorMap, ScenarioInstanceRef} from './instance'

export class ScenarioApi {

  waiter: Waiter
  callAdmin: any

  constructor (waiter: Waiter, callAdmin: any) {
    this.waiter = waiter
    this.callAdmin = callAdmin
  }

  consistent = (instances?) => new Promise((resolve, reject) => {
    this.waiter.registerCallback({
      nodes: instances ? instances.map(i => i.id) : null,
      resolve,
      reject,
    })
  })

  start = (...instances: Array<ScenarioInstanceRef | string>) => {
    return Promise.all(
      instances.map(inst => this.callAdmin('admin/instance/start')({
        id: typeof inst === 'string' ? inst : inst.id
      }))
    )
  }

  stop = (...instances: Array<ScenarioInstanceRef | string>) => {
    return Promise.all(
      instances.map(inst => this.callAdmin('admin/instance/stop')({
        id: typeof inst === 'string' ? inst : inst.id
      }))
    )
  }

}
