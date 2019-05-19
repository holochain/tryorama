

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = (register) => {

  const assert = x => {
    if (!x) {
      throw "assertion error!"
    }
  }

  register('pass 1', async (s, ins) => {
    await delay(500)
    console.log('innnns', s, Object.keys(ins).length)
    assert(Object.keys(ins).length === 3)
  })

  register('pass 2', async (s, ins) => {
    await delay(500)
    console.log('innnns', s, Object.keys(ins).length)
    assert(Object.keys(ins).length === 3)
  })

  register('fail', async (s, ins) => {
    await delay(500)
    console.log('innnns', s, Object.keys(ins).length)
    assert(Object.keys(ins).length === 222)
  })

}