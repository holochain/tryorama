import { AdminApi } from '@holochain/conductor-api'

type CallZomeFunc = (zome: string, fn: string, params: any) => Promise<any>

type CellConstructorParams = {
  nick: string,
  dnaAddress: string,
  agentAddress: string,
  adminClient: AdminApi,
  callZome: CallZomeFunc,
}

/**
 * Handy reference to an cell within a Conductor.
 * Rather than using conductor.call('appId', 'cellNick', 'zomeName', 'funcName', params), you can:
 * `conductor.cells[cellNick].call('zomeName', 'funcName', params)`
 */
export class Cell {

  nick: string
  admin: AdminApi
  _callZome: CallZomeFunc
  agentAddress: string
  dnaAddress: string

  constructor(o: CellConstructorParams) {
    this.nick = o.nick
    this.admin = o.adminClient
    this._callZome = o.callZome
    this.agentAddress = o.agentAddress
    this.dnaAddress = o.dnaAddress
  }

  call = (...args): Promise<any> => {
    const [zome, fn, params] = args
    if (args.length !== 3 || typeof zome !== 'string' || typeof fn !== 'string') {
      throw new Error("cell.call() must take 3 arguments: (zomeName, funcName, params)")
    }
    return this._callZome(zome, fn, params)
  }

  stateDump = (): Promise<any> => {
    return Promise.resolve('TODO')
    // return this.admin.stateDump({ cell_id: this.id })
  }
}
