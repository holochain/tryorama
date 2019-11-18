import * as R from 'ramda'

export const expand = o => (a): Promise<any> => {

  const go = async o =>
    R.is(Function, o)
    ? go(await o(a))
    : R.is(Array, o)
    ? mapArray(o, go)
    : R.is(Object, o)
    ? mapObject(o, go)
    : o

  return go(o)
}

const mapArray = (a, f): Promise<Array<any>> => Promise.all(a.map(f))

const mapObject = (o, f): Promise<Record<any, any>> => R.pipe(
  R.toPairs,
  R.map(async ([key, val]) => {
    return [key, await f(val)]
  }),
  x => Promise.all(x).then(R.fromPairs),
)(o)