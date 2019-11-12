import * as R from 'ramda'


export const expand = o => a => {
  const dispatch = (v) =>
    (R.is(Function, v))
    ? expand(v(a))(a)
    : (R.is(Object, v))
    ? expand(v)(a)
    : v
  
  return R.is(Array, o)
  ? o.map(dispatch)
  : R.pipe(
      R.toPairs,
      R.map(([key, val]) => {
        return [key, dispatch(val)]
      }),
      R.fromPairs
    )(o)
}
