const sinon = require('sinon')
const test = require('tape')

import { combine } from '../src/middleware'

const increment = (run, f) => run(s => f({ v: s.v + 1 }))
const triple = (run, f) => run(s => f({ v: s.v * 3 }))
const addParams = (run, f) => run((s, n) => f({ v: s.v + n }))
const bangs = (run, f) => run(s => f(
  Object.assign(s, { description: s.description + '!!!' })
))

const runner = (desc, s, ...extra) => Object.assign(
  (f) => { s.description = desc; return f(s, ...extra) },
  { description: desc }
)

test('single middleware', t => {
  increment(runner('', { v: 0 }), s => {
    t.equal(s.v, 1)
  })
  t.end()
})

test('middleware combinations', t => {
  const run = runner('', { v: 0 })
  combine(triple, increment, increment)(run, s => {
    t.equal(s.v, 2)
  })
  combine(increment, triple, increment)(run, s => {
    t.equal(s.v, 4)
  })
  combine(increment, increment, triple)(run, s => {
    t.equal(s.v, 6)
  })
  t.end()
})

test('function signature modification', t => {
  addParams(runner('', { v: 1 }, 2), s => {
    t.equal(s.v, 3)
  })
  t.end()
})

test('description modification', t => {
  bangs(runner('description', {}, 2), s => {
    t.equal(s.description, 'description!!!')
  })
  t.end()
})
