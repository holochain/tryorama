type HostedPlayerConstructorParams = {
  id: string, // hosted agent instance_id
  host_id: string, // host id or uri
  host_uname: string,
  host_pwd: string,
  agentAddress: string, //hosted agent address
  dnaAddress: string,
  url:string,
}

export class HostedPlayer {

  id: string
  host_id: string,
  host_uname: string,
  host_pwd: string,
  agentAddress: string
  dnaAddress: string
  url:string

  constructor(o: HostedPlayerConstructorParams) {
    this.id = o.id
    this.host_id = o.host_id
    this.host_uname = o.host_uname
    this.host_pwd = o.host_pwd
    this.agentAddress = o.agentAddress
    this.dnaAddress = o.dnaAddress
  }

  stateDump = (): Promise<any> => {
    // make connection with the host
    // connect()
    return this._callAdmin('debug/state_dump', { instance_id: this.id })
  }

  getMeta = (...args): Promise<any> => {
    const [hash] = args
    if (args.length !== 1 || typeof hash !== 'string') {
      throw new Error("hosted_instance.getMeta() takes 1 argument: (hash)")
    }
    // make connection with the host
    hcWebClient = require('@holochain/hc-web-client')
    hp = hcWebClient.connect(this.url)
    return hp.call('admin/instance/get_meta', {id: this.id, hash: hash})
  }
}

const init = async (o: HostedPlayerConstructorParams) => {
    this.id = o.id
    this.host_id = o.host_id
    this.host_uname = o.host_uname
    this.host_pwd = o.host_pwd
    this.agentAddress = o.agentAddress
    this.dnaAddress = o.dnaAddress
    const url = 'wss://' + hostname + '/api/v1/ws/'
    const urlObj = new URL(url)
    const params = new URLSearchParams(urlObj.search.slice(1))
    params.append('X-Hpos-Admin-Signature', await signPayload('get', urlObj.pathname))
    params.sort()
    urlObj.search = params.toString()
    this.url = urlObj.toString()
    return this
}

const signPayload = async (method, request, bodyHash) => {
  const keypair = await getHostKeyPair()
  if (keypair === null) return ''
  const payload = { method: method.toLowerCase(), request, body: bodyHash || '' }
  try {
    const signature = keypair.sign(payload)
    return signature
  } catch (error) {
    throw (error)
  }
}

const getHostKeyPair = async (host_id: string, uname: string, pwd: string ) => {
  const wasm = await import('@holo-host/hp-admin-keypair')
  // TODO: need to avoid doing it on every call
  HpAdminKeypairInstance = new wasm.HpAdminKeypair(hcKey, email, password)
}
