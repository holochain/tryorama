import { CellId, CellNick } from '@holochain/conductor-api'
import { fakeCapSecret } from './common'
import { Player } from './player'

type CallZomeFunc = (zome: string, fn: string, params?: any) => Promise<any>

type CellConstructorParams = {
  cellId: CellId,
  cellNick: CellNick,
  player: Player
}

/**
 * Make zome calls from Cells.
 * `cell.call('zomeName', 'funcName', params)`
 */
export class Cell {
  cellId: CellId
  cellNick: CellNick
  _player: Player

  constructor(o: CellConstructorParams) {
    this.cellId = o.cellId
    this.cellNick = o.cellNick
    this._player = o.player
  }

  call: CallZomeFunc = async (zome: string, fn: string, params?: any): Promise<any> => {
    if (typeof zome !== 'string' || typeof fn !== 'string') {
      throw new Error("cell.call() must take at least `zome` and `fn` args")
    }

    // FIXME: don't just use provenance from CellId that we're calling,
    //        (because this always grants Authorship)
    //        for now, it makes sense to use the AgentPubKey of the *caller*,
    //        but in the future, Holochain will inject the provenance itself
    //        and you won't even be able to pass it in here.
    const [_dnaHash, provenance] = this.cellId
    return this._player.app(`cell.call()`).callZome({
      cell_id: this.cellId,
      zome_name: zome,
      cap: fakeCapSecret(), // FIXME (see Player.ts)
      fn_name: fn,
      payload: params,
      provenance, // FIXME
    })
  }

  stateDump = (): Promise<any> => {
    return this._player.admin(`cell.stateDump()`).dumpState({ cell_id: this.cellId })
  }
}
