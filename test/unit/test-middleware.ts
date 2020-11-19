const sinon = require('sinon')
import test from 'tape-promise/tape'

import * as M from '../../src/middleware'

const increment = (run, f) => run(s => f({ v: s.v + 1 }))
const triple = (run, f) => run(s => f({ v: s.v * 3 }))
const addParams = (run, f) => run((s, n) => f({ v: s.v + n }))
const bangs = (run, f) => run(s => f(
  Object.assign(s, { description: s.description + '!!!' })
))
const thrower = (run, f) => run(s => { throw new Error("failure") })
const spier = spy => (run, f) => run(s => {
  spy(s)
  return f(s)
})

const runner = (desc, s, ...extra) => Object.assign(
  async (f) => { s.description = desc; return f(s, ...extra) },
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
  M.compose3(triple, increment, increment)(run, s => {
    t.equal(s.v, 6)
  })
  M.compose3(increment, triple, increment)(run, s => {
    t.equal(s.v, 4)
  })
  M.compose3(increment, increment, triple)(run, s => {
    t.equal(s.v, 2)
  })
  t.end()
})

test('middleware combination, multiple applications', t => {
  const run = runner('', { v: 0 })
  const m = M.compose3(triple, increment, increment)
  m(run, s => { t.equal(s.v, 6) })
  m(run, s => { t.equal(s.v, 6) })
  t.end()
})

test('middleware combinations with failure (is this right?)', async t => {
  const run = runner('', { v: 0 })
  const spy1 = sinon.spy()
  const spy2 = sinon.spy()
  const spy3 = sinon.spy()
  const spy4 = sinon.spy()
  const spy5 = sinon.spy()
  const spy6 = sinon.spy()
  await t.rejects(
    M.compose(spier(spy1), thrower)(run, s => spy5())
  )
  await t.rejects(
    M.compose(thrower, spier(spy2))(run, s => spy6())
  )
  await t.rejects(
    M.compose(spier(spy3), spier(spy4))(run, s => { throw new Error('final failure') })
  )
  t.ok(spy1.notCalled)
  t.ok(spy2.calledOnce)
  t.ok(spy3.calledOnce)
  t.ok(spy4.calledOnce)
  t.ok(spy5.notCalled)
  t.ok(spy6.notCalled)
  t.ok(spy3.calledImmediatelyAfter(spy4))

  t.end()
})

test('middleware combinations with promise rejection', t => {

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