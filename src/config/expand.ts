import * as R from 'ramda'


export const expand = o => a => {
  const dispatch = (v) =>
    (typeof v === 'object')
    ? expand(v)(a)
    : (typeof v === 'function')
    ? expand(v(a))(a)
    : v
  
  return R.pipe(
    R.toPairs,
    R.map(([key, val]) => {
      return [key, dispatch(val)]
    }),
    R.fromPairs
  )(o)
}
