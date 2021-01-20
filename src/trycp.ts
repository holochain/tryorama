import * as _ from 'lodash'
// import connect from '@holochain/conductor-api'
import logger from './logger'
import * as T from './types'
import { Client as RpcWebSocket } from 'rpc-websockets'
import * as yaml from 'yaml';
import { make } from 'fp-ts/lib/Tree';
import * as msgpack from "@msgpack/msgpack"
import * as conductorApi from "@holochain/conductor-api"

export type TrycpClient = {
  saveDna: (id: string, contents: () => Promise<Buffer>) => Promise<{ path: string }>,
  downloadDna: (url: string) => Promise<{ path: string }>,
  configurePlayer: (id, partial_config) => Promise<any>,
  spawn: (id) => Promise<any>,
  kill: (id, signal?) => Promise<any>,
  ping: (id) => Promise<string>,
  reset: () => Promise<void>,
  adminInterfaceCall: (id, message) => Promise<any>,
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

  const savedDnas: Record<string, { path: string }> = {}

  return {
    saveDna: async (id, contents) => {
      if (!(id in savedDnas)) {
        savedDnas[id] = await makeCall('save_dna')({ id, content_base64: (await contents()).toString('base64') })
      }
      return savedDnas[id]
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
    adminInterfaceCall: async (id, message) => {
      let params = JSON.stringify(message)
      if (params && params.length > 1000) {
        params = params.substring(0, 993) + " [snip]"
      }
      logger.debug(`trycp tunneled admin interface call at ${url} => ${params}`)
      const raw_response = await ws.call('admin_interface_call', {
        id,
        message_base64: Buffer.from(msgpack.encode(message)).toString("base64")
      })
      const response = msgpack.decode(Buffer.from(raw_response, "base64")) as { type: string, data: any }
      logger.debug('trycp tunneled admin interface response: %j', response.data)
      if (response.type == "error") {
        throw new Error(response.data)
      }
      return response.data
    },
    closeSession: () => ws.close(),
  }
}

export class TunneledAdminClient {
  adminInterfaceCall: (any) => Promise<any>

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