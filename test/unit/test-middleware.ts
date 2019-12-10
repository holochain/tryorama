const sinon = require('sinon')
import * as tape from 'tape'
import * as R from 'ramda'
import tapeP from 'tape-promise'
const test = tapeP(tape)

import * as M from '../../src/middleware'
import { ConfigSeed, RawConductorConfig } from '../../src'

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

test('groupPlayersByMachine middleware', t => {
  const endpoints = ['e0', 'e1', 'e2', 'e3', 'e4', 'e5']
  const m1 = M.groupPlayersByMachine(endpoints, 1)
  const m2 = M.groupPlayersByMachine(endpoints, 2)
  const m3 = M.groupPlayersByMachine(endpoints, 3)
  const m4 = M.groupPlayersByMachine(endpoints, 4)
  const m6 = M.groupPlayersByMachine(endpoints, 6)
  const oldApi = {
    players: (configs) => configs
  }
  const fakeSeed = ({}) => Promise.resolve({})
  const input = R.repeat(fakeSeed, 6)
  m1(runner('1 player per machine', oldApi), async s => {
    const ps = await s.players(input as any)
    t.deepEqual(ps, {
      e0: { '0': fakeSeed },
      e1: { '1': fakeSeed },
      e2: { '2': fakeSeed },
      e3: { '3': fakeSeed },
      e4: { '4': fakeSeed },
      e5: { '5': fakeSeed },
    })
  })
  m2(runner('2 players per machine', oldApi), async s => {
    const ps = await s.players(input as any)
    t.deepEqual(ps, {
      e0: { '0': fakeSeed, '1': fakeSeed },
      e1: { '2': fakeSeed, '3': fakeSeed },
      e2: { '4': fakeSeed, '5': fakeSeed },
    })
  })
  m3(runner('3 players per machine', oldApi), async s => {
    const ps = await s.players(input as any)
    t.deepEqual(ps, {
      e0: { '0': fakeSeed, '1': fakeSeed, '2': fakeSeed },
      e1: { '3': fakeSeed, '4': fakeSeed, '5': fakeSeed },
    })
  })
  m4(runner('4 players per machine (with leftovers)', oldApi), async s => {
    const ps = await s.players(input as any)
    t.deepEqual(ps, {
      e0: { '0': fakeSeed, '1': fakeSeed, '2': fakeSeed, '3': fakeSeed },
      e1: { '4': fakeSeed, '5': fakeSeed },
    })
  })
  m6(runner('6 players per machine', oldApi), async s => {
    const ps = await s.players(input as any)
    t.deepEqual(ps, {
      e0: { '0': fakeSeed, '1': fakeSeed, '2': fakeSeed, '3': fakeSeed, '4': fakeSeed, '5': fakeSeed },
    })
  })
  t.end()
})


test('groupPlayersByMachine failure', t => {
  const endpoints = ['e0', 'e1', 'e2', 'e3', 'e4', 'e5']
  const m = M.groupPlayersByMachine(endpoints, 3)
  const oldApi = { players: (configs) => configs }
  const fakeSeed = ({}) => Promise.resolve({})
  const input = R.repeat(fakeSeed, 100)
  m(runner('1 player per machine', oldApi), async s => {
    t.rejects(
      () => s.players(input as any),
      /Can't fit 100 conductors on 6 machines in groups of 3!/
    )
  })
  t.end()
})
