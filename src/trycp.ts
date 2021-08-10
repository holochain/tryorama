import * as _ from 'lodash'
import WebSocket from 'ws';
import logger from './logger'
import * as yaml from 'yaml';
import * as msgpack from "@msgpack/msgpack"
import * as conductorApi from "@holochain/conductor-api"
import { inspect } from 'util';

export type TrycpClient = {
  saveDna: (id: string, contents: () => Promise<Buffer>) => Promise<string>,
  downloadDna: (url: string) => Promise<string>,
  configurePlayer: (id, partial_config) => Promise<void>,
  spawn: (id) => Promise<void>,
  kill: (id, signal?) => Promise<void>,
  reset: () => Promise<void>,
  adminInterfaceCall: (id, message) => Promise<any>,
  appInterfaceCall: (port, message) => Promise<any>,
  connectAppInterface: (port: number) => Promise<void>,
  disconnectAppInterface: (port: number) => Promise<void>,
  subscribeAppInterfacePort: (port: number, onSignal: (signal: conductorApi.AppSignal) => void) => void,
  unsubscribeAppInterfacePort: (port: number) => void,
  closeSession: () => Promise<void>,
}

type TrycpMessage = {
  type: 'signal',
  port: number,
  data: Buffer,
} | { type: 'response', id: number, response: any }

export const trycpSession = async (machineEndpoint: string): Promise<TrycpClient> => {
  const url = `ws://${machineEndpoint}`
  const ws = new WebSocket(url)
  ws.on("error", (e) => logger.error(`trycp client error: ${e}`))
  await new Promise<void>((resolve, reject) => {
    ws.once("error", reject)
    ws.once("open", () => {
      ws.removeEventListener("error", reject)
      resolve()
    })
  })

  // Pings to make sure the connection stays alive
  ws.on('pong', () => {
    setTimeout(() => ws.ping(), 30_000)
  })
  ws.ping()

  const responsesAwaited = {}

  const decodeSignal = (signal: Buffer): conductorApi.AppSignal => {
    const { App: [cellId, payload] } = (msgpack.decode(signal) as any)
    const decodedPayload = msgpack.decode(payload)
    return { type: "Signal", data: { cellId, payload: decodedPayload } }
  }

  const signalSubscriptions: Record<number, (signal: conductorApi.AppSignal) => void> = {}

  ws.on('message', message => {
    try {
      const decoded = msgpack.decode(Buffer.from(message)) as TrycpMessage
      switch (decoded.type) {
        case 'response':
          const { id, response } = decoded
          responsesAwaited[id](response)
          break
        case 'signal':
          const { port, data } = decoded
          const signal = decodeSignal(data)
          signalSubscriptions[port](signal)
          break
        default:
          ((_: never) => {})(decoded)
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

    await new Promise(resolve => ws.send(payload, {}, resolve))

    return await responsePromise
  }

  const makeCall = (method) => async (payload) => {
    let params = JSON.stringify(payload)
    if (params && params.length > 300) {
      params = params.substring(0, 293) + " [snip]"
    }
    logger.debug(`trycp client request to ${url}: ${method} => ${params}`)
    const result = await call({ type: method, ...payload } ) as any
    logger.debug('trycp client response: %j', result)
    if (result && 0 in result && !(1 in result)) {
      return result[0]
    }
    if (result && !(0 in result) && 1 in result) {
      throw new Error(`trycp error: ${inspect(result[1])}`)
    }
    return result
  }

  const holochainInterfaceCall = async (type: "app" | "admin", args, message) => {
    let params = JSON.stringify({ ...args, message: { type: message.type } })
    if (params && params.length > 1000) {
      params = params.substring(0, 993) + " [snip]"
    }
    logger.debug(`trycp tunneled ${type} interface call at ${url} => ${params}`)
    const result = await call({ type: `call_${type}_interface`, ...args, message: msgpack.encode(message) }) as any
    if (1 in result) {
      throw new Error(`trycp error: ${inspect(result[1])}`)
    }
    const raw_response = result[0]
    const response = msgpack.decode(raw_response) as { type: string, data: any }
    logger.debug(`trycp tunneled ${type} interface response: %j`, { type: response.type })
    if (response.type === "error") {
      throw new Error(`${type} call error: ${inspect(response.data)}`)
    }
    return response.data
  }

  const savedDnas: Record<string, Promise<string>> = {}

  const remoteLogLevel = process.env.REMOTE_LOG_LEVEL

  return {
    saveDna: async (id, contents) => {
      if (!(id in savedDnas)) {
        savedDnas[id] = (async () => makeCall('save_dna')({ id, content: await contents() }))()
      }
      return await savedDnas[id]
    },
    downloadDna: (url) => makeCall('download_dna')({ url }),
    configurePlayer: (id, partial_config) => makeCall('configure_player')({
      id, partial_config: yaml.stringify({
        signing_service_uri: partial_config.signing_service_uri !== undefined ? partial_config.signing_service_uri : null,
        encryption_service_uri: partial_config.encryption_service_uri !== undefined ? partial_config.encryption_service_uri : null,
        decryption_service_uri: partial_config.decryption_service_uri !== undefined ? partial_config.decryption_service_uri : null,
        network: partial_config.network !== undefined ? partial_config.network : null,
        dpki: partial_config.dpki !== undefined ? partial_config.dpki : null,
      })
    }),
    spawn: (id) => makeCall('startup')({ id, log_level: remoteLogLevel}),
    kill: (id, signal?) => makeCall('shutdown')({ id, signal }),
    reset: () => makeCall('reset')(undefined),
    adminInterfaceCall: (id, message) => holochainInterfaceCall("admin", { id }, message),
    appInterfaceCall: (port, message) => holochainInterfaceCall("app", { port }, message),
    connectAppInterface: (port: number) => makeCall('connect_app_interface')({ port }),
    disconnectAppInterface: (port: number) => makeCall('disconnect_app_interface')({ port }),
    subscribeAppInterfacePort: (port, onSignal) => {
      signalSubscriptions[port] = onSignal
    },
    unsubscribeAppInterfacePort: (port) => {
      delete signalSubscriptions[port]
    },
    closeSession: async () => {
      const closePromise = new Promise(resolve => ws.on('close', resolve))
      ws.close()
      if (ws.readyState !== 3) {
        await closePromise
      }
    },
  }
}

export class TunneledAdminClient {
  client = { close: async () => { } }
  private adminInterfaceCall: (any) => Promise<any>

  constructor(adminInterfaceCall: (any) => Promise<any>) {
    this.adminInterfaceCall = adminInterfaceCall
  }

  enableApp(data: conductorApi.EnableAppRequest): Promise<conductorApi.EnableAppResponse> {
    return this.adminInterfaceCall({ type: 'enable_app', data })
  }

  addAgentInfo(data: conductorApi.AddAgentInfoRequest): Promise<conductorApi.AddAgentInfoResponse> {
    return this.adminInterfaceCall({ type: 'add_agent_info', data })
  }

  attachAppInterface(data: conductorApi.AttachAppInterfaceRequest): Promise<conductorApi.AttachAppInterfaceResponse> {
    return this.adminInterfaceCall({ type: 'attach_app_interface', data })
  }

  disableApp(data: conductorApi.DisableAppRequest): Promise<conductorApi.DisableAppResponse> {
    return this.adminInterfaceCall({ type: 'disable_app', data })
  }

  dumpState(data: conductorApi.DumpStateRequest): Promise<conductorApi.DumpStateResponse> {
    return this.adminInterfaceCall({ type: 'dump_state', data }).then(JSON.parse)

  }

  generateAgentPubKey(): Promise<conductorApi.GenerateAgentPubKeyResponse> {
    return this.adminInterfaceCall({ type: 'generate_agent_pub_key' })
  }

  installApp(data: conductorApi.InstallAppRequest): Promise<conductorApi.InstallAppResponse> {
    return this.adminInterfaceCall({ type: 'install_app', data })
  }

  installAppBundle(data: conductorApi.InstallAppBundleRequest): Promise<conductorApi.InstallAppBundleResponse> {
    return this.adminInterfaceCall({ type: 'install_app_bundle', data })
  }

  listApps(data: conductorApi.ListAppsRequest): Promise<conductorApi.ListAppsResponse> {
    return this.adminInterfaceCall({ type: 'list_apps', data })
  }

  // deprecated
  listActiveApps(): Promise<conductorApi.ListActiveAppsResponse> {
    return this.adminInterfaceCall({ type: 'list_active_apps' })
  }

  listCellIds(): Promise<conductorApi.ListCellIdsResponse> {
    return this.adminInterfaceCall({ type: 'list_cell_ids' })
  }

  listDnas(): Promise<conductorApi.ListDnasResponse> {
    return this.adminInterfaceCall({ type: 'list_dnas' })
  }

  registerDna(data: conductorApi.RegisterDnaRequest): Promise<conductorApi.RegisterDnaResponse> {
    return this.adminInterfaceCall({ type: 'register_dna', data })
  }

  requestAgentInfo(data: conductorApi.RequestAgentInfoRequest): Promise<conductorApi.RequestAgentInfoResponse> {
    return this.adminInterfaceCall({ type: 'request_agent_info', data })
  }

  // used to attempt to manually restart a Paused app (...therefore must have been first enabled)
  startApp(data: conductorApi.StartAppRequest): Promise<conductorApi.StartAppResponse> {
    return this.adminInterfaceCall({ type: 'start_app', data })
  }
}

export class TunneledAppClient {
  client: { close: () => Promise<void> }
  private appInterfaceCall: (req: any) => Promise<any>
  private disconnectAppInterface: () => Promise<void>

  constructor(appInterfaceCall: (req: any) => Promise<any>, disconnectAppInterface: () => Promise<void>) {
    this.appInterfaceCall = appInterfaceCall
    this.disconnectAppInterface = disconnectAppInterface
    this.client = { close: this.close.bind(this) }
  }

  private close(): Promise<void> {
    return this.disconnectAppInterface()
  }

  appInfo(data: conductorApi.AppInfoRequest): Promise<conductorApi.AppInfoResponse> {
    return this.appInterfaceCall({ type: 'app_info', data })
  }

  callZome(data: conductorApi.CallZomeRequest): Promise<conductorApi.CallZomeResponse> {
    data.payload = msgpack.encode(data.payload)
    return this.appInterfaceCall({ type: 'zome_call', data }).then(msgpack.decode)
  }
}
