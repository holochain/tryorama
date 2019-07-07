import {Waiter} from '@holochain/hachiko'

import {delay, trace} from './util'
import * as T from './types'
import {ConductorMap, ScenarioInstanceRef} from './instance'
import {ConductorFactory} from './conductor-factory'

export class ScenarioApi {

  _waiter: Waiter
  _callAdmin: any

  constructor (waiter: Waiter, callAdmin: any) {
    this._waiter = waiter
    this._callAdmin = callAdmin
  }

  consistent = (instances?) => new Promise((resolve, reject) => {
    this._waiter.registerCallback({
      nodes: instances ? instances.map(i => i.id) : null,
      resolve,
      reject,
    })
  })

  spawn = (...factories: Array<ConductorFactory>) => Promise.all(
    factories.map(f => f.spawn())
  )

  kill = (...factories: Array<ConductorFactory>) => Promise.all(
    factories.map(f => f.kill())
  )

  // start = (...instances: Array<ScenarioInstanceRef | string>) => {
  //   return Promise.all(
  //     instances.map(inst => this._callAdmin('admin/instance/start')({
  //       id: typeof inst === 'string' ? inst : inst.id
  //     }))
  //   )
  // }

  // stop = (...instances: Array<ScenarioInstanceRef | string>) => {
  //   return Promise.all(
  //     instances.map(inst => this._callAdmin('admin/instance/stop')({
  //       id: typeof inst === 'string' ? inst : inst.id
  //     }))
  //   )
  // }

}
