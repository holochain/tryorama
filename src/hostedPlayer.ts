import * as hcWebClient from '@holochain/hc-web-client'
import { URL, URLSearchParams, Keypair } from './types'
import { makeLogger } from "./logger";
const colors = require('colors/safe')

// TODO: export types from holochain/hc-web-client
type Call = (...segments: Array<string>) => (params: any) => Promise<any>
type CallZome = (instanceId: string, zome: string, func: string) => (params: any) => Promise<any>
type OnSignal = (callback: (params: any) => void) => void
type Close = () => Promise<any>
type HostConnection = {
  call: Call,
  callZome: CallZome,
  close: Close,
  onSignal: OnSignal,
  ws: any
}

export type HostedPlayerConstructorParams = {
  id: string, // hosted agent instance_id
  agent_address: string, //hosted agent address
  dna_address: string,
  host_id: string, // host uri
  host_email: string,
  host_password: string
}

export class HostedPlayer {

  id: string
  agent_address: string
  dna_address: string
  host_id: string
  host_email: string
  host_password: string
  ws_url:string

  _host_connection: HostConnection
  _keypair: Keypair

  stateDump = async (): Promise<any> => {
    return await callAdmin(this._host_connection.call, 'debug/state_dump', { instance_id: this.id })
  }

  getMeta = async (_instanceId, ...args): Promise<any> => {
    const [hash] = args
    if (args.length !== 1 || typeof hash !== 'string') {
      throw new Error("hosted_instance.getMeta() takes 1 argument: (hash)")
    }

    return await callAdmin(this._host_connection.call, 'admin/instance/get_meta', { id: this.id, hash: hash })
  }
  close = () => {
    this._host_connection.close()
  }
  init = async ({ id, host_id, host_email, host_password, agent_address, dna_address }: HostedPlayerConstructorParams) => {
    this.id = id
    this.agent_address = agent_address
    this.dna_address = dna_address
    this.host_id = host_id
    this.host_email = host_email
    this.host_password = host_password

    // generate host keypair
    this._keypair = await getHostKeyPair(this.host_id, this.host_email, this.host_password)

    // structure host signed url
    const url = 'wss://' + this.host_id + '.holohost.net/hc/master/'
    const node_url = await import('url')
    const urlObj = new node_url.URL(url)
    const params = new node_url.URLSearchParams(urlObj.search.slice(1))
    params.append('X-Hpos-Admin-Signature', await signPayload('get', urlObj.pathname, this._keypair))
    params.sort()
    urlObj.search = params.toString()
    this.ws_url = urlObj.toString()

    // make connection with the host
    await Promise.race([
      hcWebClient.connect({
        url: this.ws_url,
        timeout: 1000,
        wsClient: { max_reconnects: 2 }
      }),
      new Promise((resolve, reject) => setTimeout(() => reject(new Error('this is it timeout')), 20000))
    ]).then((hc: any) => this._host_connection = hc)
      .catch(err => {
        throw (err)
      })
    return this
  }
}

const getHostKeyPair = async (host_id: string, email: string, password: string ) => {
  // This import has to be async because of the way that webpack interacts with wasm
  const wasm = await import('@holo-host/hp-admin-keypair')
  try {
    const HpAdminKeypairInstance = new wasm.HpAdminKeypair(host_id, email, password)
    return HpAdminKeypairInstance
  } catch (error) {
    throw error
  }
}

const signPayload = async (method: string, request: string, keypair: Keypair) => {
  if (keypair === null) throw new Error('No host keys provided. Unable to sign admin url payload.')
  const payload = { method: method.toLowerCase(), request, body: '' }
  try {
    const signature = keypair.sign(payload)
    return signature
  } catch (error) {
    throw (error)
  }
}

const callAdmin = async (call: Call, method: string, params: any) => {
  const logger = makeLogger(`tryorama: admin call to HOST`)
  logger.debug(`${colors.yellow.bold("[setup call on %s]:")} ${colors.yellow.underline("%s")}`, method)
  logger.debug(JSON.stringify(params, null, 2))
  const result = await call(method)(params)
  logger.debug(`${colors.yellow.bold('-> %o')}`, result)
  return result
}
