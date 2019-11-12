const test = require('tape')
const sinon = require('sinon')

import { expand } from '../../src/config/expand'


test('expand 1', t => {
  const seed = {
    a: 1,
    b: x => ({
      c: x,
      d: x,
    })
  }
  t.deepEqual(expand(seed)(2), {
    a: 1,
    b: {
      c: 2,
      d: 2,
    }
  })
  t.end()
})


test('basis1', t => {

  const basis1 = {
    cx: 11,
    vx: a => ({
      cy: 2 * a,
      vy: b => ({
        cz: 3 * b,
      })
    })
  }

  const c1 = expand(basis1)(111)
  t.deepEqual(c1, {
    cx: 11,
    vx: {
      cy: 222,
      vy: {
        cz: 333,
      }
    }
  })
  t.end()
})

test('basis2', t => {

  const basis2 = {
    a: 11,
    b: [
      {
        c: 22,
        d: [{}, x => [x, x], { e: [] }]
      },
      x => [x, x, x]
    ]
  }

  const c1 = expand(basis2)(1)
  t.deepEqual(c1, {
    a: 11,
    b: [
      {
        c: 22,
        d: [{}, [1, 1], { e: [] }]
      },
      [1, 1, 1]
    ]
  })
  t.end()
})