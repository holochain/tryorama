import * as R from 'ramda'
import { trace } from '../util'

export const expand = o => a => {

  const go = o =>
    R.is(Function, o)
    ? go(o(a))
    : R.is(Array, o)
    ? o.map(go)
    : R.is(Object, o)
    ? mapObject(o, go)
    : o

  return go(o)
}

const mapObject = (o, f) => R.pipe(
  R.toPairs,
  R.map(([key, val]) => {
    return [key, f(val)]
  }),
  R.fromPairs
)(o)