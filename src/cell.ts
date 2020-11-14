import { AdminApi, AppApi, CellId, CellNick } from '@holochain/conductor-api'
import { fakeCapSecret } from './common'

type CallZomeFunc = (zome: string, fn: string, params: any) => Promise<any>

type CellConstructorParams = {
  cellId: CellId,
  cellNick: CellNick,
  adminClient: AdminApi,
  appClient: AppApi,
}

/**
 * Make zome calls from Cells.
 * `cell.call('zomeName', 'funcName', params)`
 */
export class Cell {
  cellId: CellId
  cellNick: CellNick
  adminClient: AdminApi
  appClient: AppApi

  constructor(o: CellConstructorParams) {
    this.cellId = o.cellId
    this.cellNick = o.cellNick
    this.appClient = o.appClient
    this.adminClient = o.adminClient
  }

  call = (...args): Promise<any> => {
    const [zome, fn, params] = args
    if (args.length !== 3 || typeof zome !== 'string' || typeof fn !== 'string') {
      throw new Error("cell.call() must take 3 arguments: (zomeName, funcName, params)")
    }
    return this._callZome(zome, fn, params)
  }

  _callZome: CallZomeFunc = async (zome: string, fn: string, payload: any): Promise<any> => {
    // FIXME: don't just use provenance from CellId that we're calling,
    //        (because this always grants Authorship)
    //        for now, it makes sense to use the AgentPubKey of the *caller*,
    //        but in the future, Holochain will inject the provenance itself
    //        and you won't even be able to pass it in here.
    const [_dnaHash, provenance] = this.cellId
    return this.appClient!.callZome({
      cell_id: this.cellId,
      zome_name: zome,
      cap: fakeCapSecret(), // FIXME (see Player.ts)
      fn_name: fn,
      payload,
      provenance, // FIXME
    })
  }

  stateDump = (): Promise<any> => {
    return this.adminClient.dumpState({ cell_id: this.cellId })
  }
}
