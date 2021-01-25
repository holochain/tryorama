import * as _ from 'lodash'
// import connect from '@holochain/conductor-api'
import logger from './logger'
import * as T from './types'
import { Client as RpcWebSocket } from 'rpc-websockets'
import * as yaml from 'yaml';
import { make } from 'fp-ts/lib/Tree';
import * as msgpack from "@msgpack/msgpack"
import * as conductorApi from "@holochain/conductor-api"
import { sign } from 'fp-ts/lib/Ordering';

export type TrycpClient = {
  saveDna: (id: string, contents: () => Promise<Buffer>) => Promise<{ path: string }>,
  downloadDna: (url: string) => Promise<{ path: string }>,
  configurePlayer: (id, partial_config) => Promise<any>,
  spawn: (id) => Promise<any>,
  kill: (id, signal?) => Promise<any>,
  ping: (id) => Promise<string>,
  reset: () => Promise<void>,
  adminInterfaceCall: (id, message) => Promise<any>,
  appInterfaceCall: (port, message) => Promise<any>,
  pollAppInterfaceSignals: (port) => Promise<Array<Buffer>>
  closeSession: () => Promise<void>,
}

export const trycpSession = async (machineEndpoint: string): Promise<TrycpClient> => {
  const url = `ws://${machineEndpoint}`
  const ws = new RpcWebSocket(url)
  ws.on("error", (e) => logger.error(`trycp client error: ${e}`))
  await new Promise<void>((resolve, reject) => {
    ws.once("error", reject)
    ws.once("open", () => {
      ws.removeListener(reject)
      resolve()
    })
  })

  const makeCall = (method) => async (a) => {
    let params = JSON.stringify(a, null, 2)
    if (params && params.length > 1000) {
      params = params.substring(0, 993) + " [snip]"
    }
    logger.debug(`trycp client request to ${url}: ${method} => ${params}`)
    const result = await ws.call(method, a)
    logger.debug('trycp client response: %j', result)
    return result
  }

  const holochainInterfaceCall = async (type: "app" | "admin", args, message) => {
    let params = JSON.stringify(message)
    if (params && params.length > 1000) {
      params = params.substring(0, 993) + " [snip]"
    }
    logger.debug(`trycp tunneled ${type} interface call at ${url} => ${params}`)
    const raw_response = await ws.call(`${type}_interface_call`, {
      ...args,
      message_base64: Buffer.from(msgpack.encode(message)).toString("base64")
    })
    const response = msgpack.decode(Buffer.from(raw_response, "base64")) as { type: string, data: any }
    logger.debug(`trycp tunneled ${type} interface response: %j`, response)
    if (response.type === "error") {
      throw new Error(JSON.stringify(response.data))
    }
    return response.data
  }

  const savedDnas: Record<string, Promise<{ path: string }>> = {}

  return {
    saveDna: async (id, contents) => {
      if (!(id in savedDnas)) {
        savedDnas[id] = (async () => makeCall('save_dna')({ id, content_base64: (await contents()).toString('base64') }))()
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
    spawn: (id) => makeCall('startup')({ id }),
    kill: (id, signal?) => makeCall('shutdown')({ id, signal }),
    ping: () => makeCall('ping')(undefined),
    reset: () => makeCall('reset')(undefined),
    adminInterfaceCall: (id, message) => holochainInterfaceCall("admin", { id }, message),
    appInterfaceCall: (port, message) => holochainInterfaceCall("app", { port }, message),
    pollAppInterfaceSignals: async (port) => {
      const signals_base64: string[] = await makeCall('poll_app_interface_signals')({ port })
      return signals_base64.map((signal_base64) => Buffer.from(signal_base64, 'base64'))
    },
    closeSession: () => ws.close(),
  }
}

export class TunneledAdminClient {
  client = { close: async () => { } }
  private adminInterfaceCall: (any) => Promise<any>

  constructor(adminInterfaceCall: (any) => Promise<any>) {
    this.adminInterfaceCall = adminInterfaceCall
  }

  activateApp(data: conductorApi.ActivateAppRequest): Promise<conductorApi.ActivateAppResponse> {
    return this.adminInterfaceCall({ type: 'activate_app', data })
  }

  addAgentInfo(data: conductorApi.AddAgentInfoRequest): Promise<conductorApi.AddAgentInfoResponse> {
    return this.adminInterfaceCall({ type: 'add_agent_info', data })
  }

  attachAppInterface(data: conductorApi.AttachAppInterfaceRequest): Promise<conductorApi.AttachAppInterfaceResponse> {
    return this.adminInterfaceCall({ type: 'attach_app_interface', data })
  }

  deactivateApp(data: conductorApi.DeactivateAppRequest): Promise<conductorApi.DeactivateAppResponse> {
    return this.adminInterfaceCall({ type: 'deactivate_app', data })
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
}

interface Signal {
  type: "Signal",
  data: { cellId: any, payload: any }
}

const decodeSignal = (signal: Buffer): Signal => {
  const { App: [cellId, payload] } = (msgpack.decode(signal) as any)
  const decodedPayload = msgpack.decode(payload)
  return { type: "Signal", data: { cellId, payload: decodedPayload } }
}

export class TunneledAppClient {
  client: { close: () => Promise<void> }
  private appInterfaceCall: (req: any) => Promise<any>
  private timeout: NodeJS.Timeout
  private pollAppInterfaceSignals: () => Promise<Array<Buffer>>
  private onSignal: (signal: Signal) => void

  constructor(appInterfaceCall: (req: any) => Promise<any>, pollAppInterfaceSignals: () => Promise<Array<Buffer>>, onSignal: (signal: Signal) => void) {
    this.appInterfaceCall = appInterfaceCall
    this.pollAppInterfaceSignals = pollAppInterfaceSignals
    this.onSignal = onSignal
    const f = () => {
      this.pollSignals().then(
        () => this.timeout = global.setTimeout(f, 500),
        (error) =>
          // The app interface is probably disconnected. Stop polling moving forward.
          logger.debug(`failed to poll app interface signals: ${error}`)
      )

    }
    this.timeout = global.setTimeout(f, 500)
    this.client = { close: () => Promise.resolve(this.close()) }
  }

  private async pollSignals() {
    for (const signal of await this.pollAppInterfaceSignals()) {
      this.onSignal(decodeSignal(signal))
    }
  }

  close(): void {
    global.clearTimeout(this.timeout)
    // TODO: send a message like close_app_interface_connection to trycp
  }

  appInfo(data: conductorApi.AppInfoRequest): Promise<conductorApi.AppInfoResponse> {
    return this.appInterfaceCall({ type: 'app_info', data })
  }

  callZome(data: conductorApi.CallZomeRequest): Promise<conductorApi.CallZomeResponse> {
    data.payload = msgpack.encode(data.payload)
    return this.appInterfaceCall({ type: 'zome_call', data }).then(msgpack.decode)
  }
}
