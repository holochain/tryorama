const WebSocket = require('ws')
const msgpack = require('@msgpack/msgpack')

process.on('unhandledRejection', error => {
  console.error('got unhandledRejection:', error)
})

doTest('ws://localhost:9000')
//doTest("wss://test1-eu-central-1.holochain-aws.org")
//magic_remote_machine_manager("3000")
function magic_remote_machine_manager (port) {
  const { spawn } = require('child_process')
  const trycp = spawn('trycp_server', ['-p', port])
  trycp.stdout.on('data', data => {
    const regex = new RegExp('waiting for connections on port ' + port)
    if (regex.test(data)) {
      doTest('ws://localhost:' + port)
    }
    console.log(`stdout: ${data}`)
  })
  trycp.stderr.on('data', data => {
    console.error(`stderr: ${data}`)
  })
}

async function doTest (url) {
  console.log('starting up at ', url)
  const ws = new WebSocket(url)
  await new Promise(resolve => ws.on('open', resolve))

  console.log('making ping call')
  const pongPromise = new Promise(resolve => ws.on('pong', resolve))
  await new Promise(resolve => ws.ping(undefined, undefined, resolve))

  await pongPromise
  console.log('pong!')

  const responsesAwaited = {}

  ws.on('message', message => {
    console.log('received message', message)
    try {
      const decoded = msgpack.decode(message)
      switch (decoded.type) {
        case 'response':
          const { id, response } = decoded
          responsesAwaited[id](response)
          break
        case 'signal':
          const { port, data } = decoded
          break
        default:
          throw new Error('unexpected message from trycp')
      }
    } catch (e) {
      console.error('Error processing message', message, e)
    }
  })

  let nextId = 0

  const call = async request => {
    const id = nextId
    nextId++

    const payload = msgpack.encode({
      id,
      request
    })

    const responsePromise = new Promise(
      resolve => (responsesAwaited[id] = resolve)
    )

    await new Promise(resolve => ws.send(payload, undefined, resolve))

    return await responsePromise
  }

  console.log('calling download_dna')

  console.log(
    'download_dna response:',
    await call({
      type: 'download_dna',
      url:
        'https://github.com/holochain/elemental-chat/releases/download/v0.0.1-alpha15/elemental-chat.dna.gz'
    })
  )

  console.log('calling download_dna again to test caching')
  console.log(
    'download_dna response:',
    await call({
      type: 'download_dna',
      url:
        'https://github.com/holochain/elemental-chat/releases/download/v0.0.1-alpha15/elemental-chat.dna.gz'
    })
  )

  const config = `signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
network: ~`

  console.log('making configure_player call')
  let result = await call({
    type: 'configure_player',
    id: 'my-player',
    partial_config: config
  })
  console.log(result)

  console.log('making configure_player call')
  result = await call({
    type: 'configure_player',
    id: 'my-player2',
    partial_config: config
  })
  console.log(result)

  console.log('making startup call')
  result = await call({ type: 'startup', id: 'my-player' })
  console.log(result)

  console.log('making call_admin_interface')
  result = await call({
    type: 'call_admin_interface',
    id: 'my-player',
    message: msgpack.encode({ type: 'generate_agent_pub_key' })
  })
  console.log(msgpack.decode(result[0]))

  console.log('making shutdown call')
  result = await call({ type: 'shutdown', id: 'my-player', signal: 'SIGTERM' })
  console.log(result)

  console.log('making startup call2')
  result = await call({ type: 'startup', id: 'my-player' })
  console.log(result)

  console.log('making reset call')
  result = await call({ type: 'reset' })
  console.log(result)

  console.log('making player2 call with config')
  result = await call({
    type: 'configure_player',
    id: 'my-player',
    partial_config: config
  })
  console.log(result)

  // close a websocket connection
  ws.close()
}
