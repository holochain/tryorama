const test = require('tape')
const sinon = require('sinon')
import * as _ from 'lodash'
import { expand } from '../../src/config/expand'


test('expand 1', async t => {
  const seed = {
    a: 1,
    b: x => ({
      c: x,
      d: x,
    })
  }
  t.deepEqual(await expand(seed)(2), {
    a: 1,
    b: {
      c: 2,
      d: 2,
    }
  })
  t.end()
})


test('expand 2', async t => {

  const seed = {
    cx: 11,
    vx: a => ({
      cy: 2 * a,
      vy: b => ({
        cz: 3 * b,
      })
    })
  }

  const tree = await expand(seed)(111)
  t.deepEqual(tree, {
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

test('expand 3', async t => {

  const seed = {
    a: 11,
    b: [
      {
        c: 22,
        d: [{}, async x => [x, x], { e: [] }]
      },
      x => [x, x, x]
    ]
  }

  const tree = await expand(seed)(1)
  t.deepEqual(tree, {
    a: 11,
    b: [
      {
        c: 22,
        d: [{}, [1, 1], { e: [] }]
      },
      [1, 1, 1]
    ]
  })
  t.ok(_.isArray(tree.b[0].d))
  t.end()
})


test('expand function at root', async t => {
  const seed = async a => ({
    x: a,
    y: b => ({
      z: b
    })
  })
  t.deepEqual(await expand(seed)(1), {
    x: 1,
    y: {
      z: 1,
    }
  })
  t.end()
})
