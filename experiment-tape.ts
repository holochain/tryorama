
const tape = require('tape');

const htest = tape.createHarness()

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const setup = async () => {
  await delay(500);
  [1, 2, 3, 4].forEach(i => {
    tape('' + i, t => {
      t.ok(i)
      t.end()
    })
  })

  // as long as there is no delay between tests, it's fine...

  for (const i of [5, 6, 7, 8]) {
    tape('' + i, t => {
      t.ok(i)
      t.end()
    })
  }
}

setTimeout(setup, 10)