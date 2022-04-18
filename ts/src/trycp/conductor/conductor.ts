import assert from "assert";
import uniqueId from "lodash/uniqueId";
import getPort, { portNumbers } from "get-port";
import { PlayerLogLevel as TryCpConductorLogLevel, TryCpClient } from "..";
import {
  AgentInfoSigned,
  AgentPubKey,
  CallZomeRequest,
  CellId,
  EnableAppResponse,
  HoloHash,
  InstallAppDnaPayload,
  InstalledAppId,
} from "@holochain/client";
import {
  TRYCP_SUCCESS_RESPONSE,
  RequestAdminInterfaceData,
  RequestCallAppInterfaceMessage,
} from "../types";
import { ZomeResponsePayload } from "../../../test/fixture";
import { deserializeZomeResponsePayload } from "../util";

export const DEFAULT_PARTIAL_PLAYER_CONFIG = `signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
network: ~`;

/**
 * @public
 */
export type ConductorId = string;

/**
 * The function to create a TryCP Conductor (aka "Player").
 *
 * @param url - The URL of the TryCP server to connect to.
 * @param id - An optional name for the Conductor.
 * @returns A configured Conductor instance.
 *
 * @public
 */
export const createConductor = async (url: string, id?: ConductorId) => {
  const client = await TryCpClient.create(url);
  return new TryCpConductor(client, id);
};

/**
 * @public
 */
export class TryCpConductor {
  private id: string;
  private appInterfacePort: undefined | number;

  public constructor(
    private readonly tryCpClient: TryCpClient,
    id?: ConductorId
  ) {
    this.id = id || "conductor-" + uniqueId();
  }

  async destroy() {
    await this.shutdown();
    const response = await this.tryCpClient.close();
    assert(typeof response === "number");
    return response;
  }

  async reset() {
    const response = await this.tryCpClient.call({
      type: "reset",
    });
    assert(response === TRYCP_SUCCESS_RESPONSE);
    return response;
  }

  async downloadDna(url: URL) {
    const response = await this.tryCpClient.call({
      type: "download_dna",
      url: url.href,
    });
    assert(typeof response === "string");
    return response;
  }

  async saveDna(dnaContent: Buffer) {
    const response = await this.tryCpClient.call({
      type: "save_dna",
      id: "./entry.dna",
      content: dnaContent,
    });
    assert(typeof response === "string");
    return response;
  }

  async configure(partialConfig?: string) {
    const response = await this.tryCpClient.call({
      type: "configure_player",
      id: this.id,
      partial_config: partialConfig || DEFAULT_PARTIAL_PLAYER_CONFIG,
    });
    assert(response === TRYCP_SUCCESS_RESPONSE);
    return response;
  }

  async startup(log_level?: TryCpConductorLogLevel) {
    const response = await this.tryCpClient.call({
      type: "startup",
      id: this.id,
      log_level,
    });
    assert(response === TRYCP_SUCCESS_RESPONSE);
    return response;
  }

  async shutdown() {
    const response = await this.tryCpClient.call({
      type: "shutdown",
      id: this.id,
    });
    assert(response === TRYCP_SUCCESS_RESPONSE);
    return response;
  }

  async connectAppInterface() {
    assert(this.appInterfacePort, "No App interface attached to conductor");
    const response = await this.tryCpClient.call({
      type: "connect_app_interface",
      port: this.appInterfacePort,
    });
    assert(response === TRYCP_SUCCESS_RESPONSE);
    return response;
  }

  async callAdminApi(message: RequestAdminInterfaceData) {
    const response = await this.tryCpClient.call({
      type: "call_admin_interface",
      id: this.id,
      message,
    });
    assert(response !== TRYCP_SUCCESS_RESPONSE);
    assert(typeof response !== "string");
    return response;
  }

  async registerDna(path: string): Promise<HoloHash> {
    const response = await this.callAdminApi({
      type: "register_dna",
      data: { path },
    });
    assert("data" in response);
    assert(response.data);
    assert("BYTES_PER_ELEMENT" in response.data);
    return response.data;
  }

  async generateAgentPubKey(): Promise<HoloHash> {
    const response = await this.callAdminApi({
      type: "generate_agent_pub_key",
    });
    assert("data" in response);
    assert(response.data);
    assert("BYTES_PER_ELEMENT" in response.data);
    return response.data;
  }

  async installApp(data: {
    installed_app_id: string;
    agent_key: AgentPubKey;
    dnas: InstallAppDnaPayload[];
  }) {
    const response = await this.callAdminApi({
      type: "install_app",
      data,
    });
    assert("data" in response);
    assert(response.data);
    assert("cell_data" in response.data);
    return response.data;
  }

  async enableApp(
    installed_app_id: InstalledAppId
  ): Promise<EnableAppResponse> {
    const response = await this.callAdminApi({
      type: "enable_app",
      data: {
        installed_app_id,
      },
    });
    assert("data" in response);
    assert(response.data);
    assert("app" in response.data);
    return response.data;
  }

  async attachAppInterface(port?: number) {
    port = port ?? (await getPort({ port: portNumbers(30000, 40000) }));
    const response = await this.callAdminApi({
      type: "attach_app_interface",
      data: { port },
    });
    assert("data" in response);
    assert(response.data);
    assert("port" in response.data);
    this.appInterfacePort = port;
    return response.data.port;
  }

  /**
   * Get agent infos, optionally of a particular cell.
   * @param cellId - The cell id to get agent infos of.
   * @returns The agent infos.
   */
  async requestAgentInfo(cellId?: CellId): Promise<AgentInfoSigned[]> {
    const response = await this.callAdminApi({
      type: "request_agent_info",
      data: {
        cell_id: cellId || null,
      },
    });
    assert("data" in response);
    assert(Array.isArray(response.data));
    return response.data;
  }

  /**
   * Add agents to a conductor.
   * @param signedAgentInfos - The agents to add to the conductor.
   */
  async addAgentInfo(signedAgentInfos: AgentInfoSigned[]) {
    const response = await this.callAdminApi({
      type: "add_agent_info",
      data: { agent_infos: signedAgentInfos },
    });
    assert(response.type === "agent_info_added");
    return response;
  }

  /**
   * Call conductor's App API
   */
  async callAppApi(message: RequestCallAppInterfaceMessage) {
    assert(this.appInterfacePort, "No App interface attached to conductor");
    const response = await this.tryCpClient.call({
      type: "call_app_interface",
      port: this.appInterfacePort,
      message,
    });
    assert(response !== TRYCP_SUCCESS_RESPONSE);
    assert(typeof response !== "string");
    assert("data" in response);
    return response;
  }

  /**
   * Request info of an installed hApp.
   *
   * @param installed_app_id - The id of the hApp to query.
   * @returns The app info.
   */
  async appInfo(installed_app_id: string) {
    const response = await this.callAppApi({
      type: "app_info",
      data: { installed_app_id },
    });
    assert(response.type === "app_info");
    assert(response.data === null || "installed_app_id" in response.data);
    return response.data;
  }

  /**
   * Make a zome call to a conductor through the TryCP server.
   *
   * @param request - The zome call parameters.
   * @returns The result of the zome call.
   */
  async callZome<T extends ZomeResponsePayload>(request: CallZomeRequest) {
    const response = await this.callAppApi({
      type: "zome_call",
      data: request,
    });
    assert(response.data);
    assert("BYTES_PER_ELEMENT" in response.data);
    const deserializedPayload = deserializeZomeResponsePayload<T>(
      response.data
    );
    return deserializedPayload;
  }
}
