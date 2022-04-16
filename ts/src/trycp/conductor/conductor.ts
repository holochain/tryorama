import assert from "assert";
import uniqueId from "lodash/uniqueId";
import { PlayerLogLevel as TryCpConductorLogLevel, TryCpClient } from "..";
import { TRYCP_SERVER_HOST, TRYCP_SERVER_PORT } from "../trycp-server";
import {
  AgentInfoSigned,
  AgentPubKey,
  CallZomeRequest,
  CellId,
  EnableAppResponse,
  HoloHash,
  InstalledAppId,
} from "@holochain/client";
import { DnaInstallOptions } from "./types";
import { TRYCP_RESPONSE_SUCCESS, ZomeResponsePayload } from "../types";

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
export const createConductor = async (url?: string, id?: ConductorId) => {
  url = url || `ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`;
  const client = await TryCpClient.create(url);
  return new TryCpConductor(client, id);
};

/**
 * @public
 */
export class TryCpConductor {
  private id: string;

  public constructor(
    private readonly tryCpClient: TryCpClient,
    id?: ConductorId
  ) {
    this.id = "conductor-" + (id || uniqueId());
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
    assert(response === TRYCP_RESPONSE_SUCCESS);
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
    assert(response === TRYCP_RESPONSE_SUCCESS);
    return response;
  }

  async startup(log_level?: TryCpConductorLogLevel) {
    const response = await this.tryCpClient.call({
      type: "startup",
      id: this.id,
      log_level,
    });
    assert(response === TRYCP_RESPONSE_SUCCESS);
    return response;
  }

  async shutdown() {
    const response = await this.tryCpClient.call({
      type: "shutdown",
      id: this.id,
    });
    assert(response === TRYCP_RESPONSE_SUCCESS);
    return response;
  }

  async registerDna(path: string): Promise<HoloHash> {
    const response = await this.tryCpClient.call({
      type: "call_admin_interface",
      id: this.id,
      message: {
        type: "register_dna",
        data: { path },
      },
    });
    assert(response !== TRYCP_RESPONSE_SUCCESS);
    assert(typeof response !== "string");
    assert("BYTES_PER_ELEMENT" in response.data);
    return response.data;
  }

  async generateAgentPubKey(): Promise<HoloHash> {
    const response = await this.tryCpClient.call({
      type: "call_admin_interface",
      id: this.id,
      message: { type: "generate_agent_pub_key" },
    });
    assert(response !== TRYCP_RESPONSE_SUCCESS);
    assert(typeof response !== "string");
    assert("BYTES_PER_ELEMENT" in response.data);
    return response.data;
  }

  async installApp(data: {
    installed_app_id: string;
    agent_key: AgentPubKey;
    dnas: DnaInstallOptions[];
  }) {
    const response = await this.tryCpClient.call({
      type: "call_admin_interface",
      id: this.id,
      message: {
        type: "install_app",
        data,
      },
    });
    assert(response !== TRYCP_RESPONSE_SUCCESS);
    assert(typeof response !== "string");
    assert("cell_data" in response.data);
    return response.data;
  }

  async enableApp(
    installed_app_id: InstalledAppId
  ): Promise<EnableAppResponse> {
    const response = await this.tryCpClient.call({
      type: "call_admin_interface",
      id: this.id,
      message: {
        type: "enable_app",
        data: {
          installed_app_id,
        },
      },
    });
    assert(response !== TRYCP_RESPONSE_SUCCESS);
    assert(typeof response !== "string");
    assert("app" in response.data);
    return response.data;
  }

  async attachAppInterface(port: number) {
    const response = await this.tryCpClient.call({
      type: "call_admin_interface",
      id: this.id,
      message: {
        type: "attach_app_interface",
        data: { port },
      },
    });
    assert(response !== TRYCP_RESPONSE_SUCCESS);
    assert(typeof response !== "string");
    assert("port" in response.data);
    return response.data.port;
  }

  async connectAppInterface(port: number) {
    const response = await this.tryCpClient.call({
      type: "connect_app_interface",
      port,
    });
    assert(response === TRYCP_RESPONSE_SUCCESS);
    return response;
  }

  /**
   * Get agent infos, optionally of a particular cell.
   * @param cellId - The cell id to get agent infos of.
   * @returns The agent infos.
   */
  async requestAgentInfo(cellId?: CellId): Promise<AgentInfoSigned[]> {
    const response = await this.tryCpClient.call({
      type: "call_admin_interface",
      id: this.id,
      message: {
        type: "request_agent_info",
        data: {
          cell_id: cellId || null,
        },
      },
    });
    assert(response !== TRYCP_RESPONSE_SUCCESS);
    assert(typeof response !== "string");
    assert(Array.isArray(response.data));
    return response.data;
  }

  /**
   * Add agents to a conductor.
   * @param signedAgentInfos - The agents to add to the conductor.
   */
  async addAgentInfo(signedAgentInfos: AgentInfoSigned[]) {
    const response = await this.tryCpClient.call({
      type: "call_admin_interface",
      id: this.id,
      message: {
        type: "add_agent_info",
        data: { agent_infos: signedAgentInfos },
      },
    });
    assert(response !== TRYCP_RESPONSE_SUCCESS);
    assert(typeof response !== "string");
    assert(response.type === "agent_info_added");
    return response;
  }

  /**
   * Make a zome call to a conductor through the TryCP server.
   */
  async callZome<T extends ZomeResponsePayload>(
    port: number,
    request: CallZomeRequest
  ) {
    const response = await this.tryCpClient.call({
      type: "call_app_interface",
      port,
      message: {
        type: "zome_call",
        data: request,
      },
    });
    assert(response !== TRYCP_RESPONSE_SUCCESS);
    assert(typeof response !== "string");
    return response.data as T;
  }
}
