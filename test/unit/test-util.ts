const sinon = require('sinon')
import * as tape from 'tape'
import * as U from '../../src/util'

tape('stripPortFromUrl', t => {
  t.equal(U.stripPortFromUrl('holo.host:1'), 'holo.host')
  t.equal(U.stripPortFromUrl('holo.host:12'), 'holo.host')
  t.equal(U.stripPortFromUrl('holo.host:123'), 'holo.host')
  t.equal(U.stripPortFromUrl('holo.host:1234'), 'holo.host')
  t.equal(U.stripPortFromUrl('holo.host:12345'), 'holo.host')
  t.equal(U.stripPortFromUrl('http://holo.host:12345'), 'http://holo.host')
  t.equal(U.stripPortFromUrl('ws://holo.host:1234'), 'ws://holo.host')
  t.throws(() => U.stripPortFromUrl('holo.host:123456'), /No port/)
  t.throws(() => U.stripPortFromUrl('holo.host:'), /No port/)
  t.throws(() => U.stripPortFromUrl('holo.host'), /No port/)
  t.throws(() => U.stripPortFromUrl('http://holo.host'), /No port/)
  t.throws(() => U.stripPortFromUrl(''), /No port/)
  t.end()
})
