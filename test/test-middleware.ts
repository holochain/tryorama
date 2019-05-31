import {compose} from '../src/middleware'

import * as test from 'tape'

// Two middlewares that will be composed together
const testMiddlewares = t => [
  f => (s, ins) => {
    t.deepEqual(s, {x: 1})
    t.deepEqual(ins, ['p'])
    s.y = 2
    ins.push('q')
    return f(s, ins)
  },
  f => (s, ins) => {
    t.deepEqual(s, {})
    t.deepEqual(ins, [])
    s.x = 1
    ins.push('p')
    return f(s, ins)
  }
]

test("the concept of middleware composition is sound", async t => {
  const f = async (s, ins) => {
    t.deepEqual(s, {x: 1, y: 2})
    t.deepEqual(ins, ['p', 'q'])
  }
  const [m1, m2] = testMiddlewares(t)
  const g = m2(m1(f))  // equivalent of `compose([m1, m2])`
  await g({}, [])
  t.end()
})

test("compose middlewares", async t => {
  const f = (s, ins) => ({s, ins})
  const m = compose(...testMiddlewares(t))
  const g = m(async (s, ins) => {
    t.deepEqual(s, {x: 1, y: 2})
    t.deepEqual(ins, ['p', 'q'])
  })
  await g({}, [])
  t.end()
})
