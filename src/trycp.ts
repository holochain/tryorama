import { connect } from '@holochain/hc-web-client'

export const trycpSession = async (url, id) => {
  const { call, close } = await connect(url)

  return {
    player: (config) => call('player')({ id, config }),
    spawn: () => call('spawn')({ id }),
    kill: (signal?) => call('kill')({ id, signal }),
    ping: () => call('ping')({ id }),
    closeSession: () => close(),
  }
}
