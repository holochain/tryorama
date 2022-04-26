import assert from "assert";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import getPort, { portNumbers } from "get-port";
import { Conductor } from "../../types";
import { TryCpConductorLogLevel, TryCpClient } from "..";
import {
  AddAgentInfoRequest,
  AgentInfoSigned,
  AgentPubKey,
  AttachAppInterfaceRequest,
  CallZomeRequest,
  CellId,
  DnaHash,
  DnaSource,
  EnableAppRequest,
  EnableAppResponse,
  InstallAppRequest,
  RegisterDnaRequest,
  RequestAgentInfoRequest,
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
 * @public
 */
export interface TryCpConductorOptions {
  id?: ConductorId;
  partialConfig?: string;
  startup?: boolean;
  logLevel?: TryCpConductorLogLevel;
  cleanAllConductors?: boolean;
}

/**
 * The function to create a TryCP Conductor (aka "Player").
 *
 * @param url - The URL of the TryCP server to connect to.
 * @param options - Optional parameters to name, configure and start the
 * Conductor as well as clean all existing conductors.
 * @returns A configured Conductor instance.
 *
 * @public
 */
export const createTryCpConductor = async (
  url: string,
  options?: TryCpConductorOptions
) => {
  const client = await TryCpClient.create(url);
  const conductor = new TryCpConductor(client, options?.id);
  if (options?.cleanAllConductors) {
    // clean all conductors when explicitly set
    await conductor.cleanAllConductors();
  }
  if (options?.startup !== false) {
    // configure and startup conductor by default
    await conductor.configure(options?.partialConfig);
    await conductor.startup(options?.logLevel);
  }
  return conductor;
};

/**
 * @public
 */
export class TryCpConductor implements Conductor {
  private id: string;
  private appInterfacePort: undefined | number;

  public constructor(
    private readonly tryCpClient: TryCpClient,
    id?: ConductorId
  ) {
    this.id = id || "conductor-" + uuidv4();
  }

  async shutdown() {
    await this.shutdownConductor();
    const response = await this.tryCpClient.close();
    assert(response === 1000);
    return response;
  }

  async cleanAllConductors() {
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

  async shutdownConductor() {
    const response = await this.tryCpClient.call({
      type: "shutdown",
      id: this.id,
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

  async registerDna(request: RegisterDnaRequest & DnaSource): Promise<DnaHash> {
    assert("path" in request);
    const response = await this.callAdminApi({
      type: "register_dna",
      data: { path: request.path },
    });
    assert("data" in response);
    assert(response.data);
    assert("BYTES_PER_ELEMENT" in response.data);
    return response.data;
  }

  async generateAgentPubKey(): Promise<AgentPubKey> {
    const response = await this.callAdminApi({
      type: "generate_agent_pub_key",
    });
    assert("data" in response);
    assert(response.data);
    assert("BYTES_PER_ELEMENT" in response.data);
    return response.data;
  }

  async installApp(data: InstallAppRequest) {
    const response = await this.callAdminApi({
      type: "install_app",
      data,
    });
    assert("data" in response);
    assert(response.data);
    assert("cell_data" in response.data);
    return response.data;
  }

  async enableApp(request: EnableAppRequest): Promise<EnableAppResponse> {
    const response = await this.callAdminApi({
      type: "enable_app",
      data: request,
    });
    assert("data" in response);
    assert(response.data);
    assert("app" in response.data);
    return response.data;
  }

  async attachAppInterface(request?: AttachAppInterfaceRequest) {
    request = request ?? {
      port: await getPort({ port: portNumbers(30000, 40000) }),
    };
    const response = await this.callAdminApi({
      type: "attach_app_interface",
      data: request,
    });
    assert("data" in response);
    assert(response.data);
    assert("port" in response.data);
    this.appInterfacePort = request.port;
    return { port: response.data.port };
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

  /**
   * Get agent infos, optionally of a particular cell.
   * @param cellId - The cell id to get agent infos of.
   * @returns The agent infos.
   */
  async requestAgentInfo(
    req: RequestAgentInfoRequest
  ): Promise<AgentInfoSigned[]> {
    const response = await this.callAdminApi({
      type: "request_agent_info",
      data: {
        cell_id: req.cell_id || null,
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
  async addAgentInfo(request: AddAgentInfoRequest) {
    const response = await this.callAdminApi({
      type: "add_agent_info",
      data: request,
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

  /**
   * Helper to install DNAs and create agents. Given an array of DNAs for each
   * agent to be created, an agentPubKey is generated and the DNAs for the
   * agent are installed.  and handles to the
   * conductor, the cells and the agents are returned.
   *
   * @param dnas - An array of DNA sources for each agent (= two-dimensional
   * array).
   * @returns An array of agents and handles to their created cells (= two-
   * dimensional array).
   *
   * @public
   */
  async installAgentsDnas(dnas: DnaSource[]) {
    const agentsCells: Array<{ agentPubKey: AgentPubKey; cellId: CellId }> = [];

    for (const dna of dnas) {
      let dnaHash: Uint8Array;
      if ("path" in dna) {
        const dnaContent = await new Promise<Buffer>((resolve, reject) => {
          fs.readFile(dna.path, null, (err, data) => {
            if (err) {
              reject(err);
            }
            resolve(data);
          });
        });
        const relativePath = await this.saveDna(dnaContent);
        dnaHash = await this.registerDna({ path: relativePath });
      } else {
        dnaHash = new Uint8Array();
        throw new Error("Not dnaHashed");
      }
      const agentPubKey = await this.generateAgentPubKey();
      const appId = `app-${uuidv4()}`;
      const installedAppInfo = await this.installApp({
        installed_app_id: appId,
        agent_key: agentPubKey,
        dnas: [{ hash: dnaHash, role_id: `${uuidv4()}-dna` }],
      });
      const { cell_id } = installedAppInfo.cell_data[0];
      await this.enableApp({ installed_app_id: appId });
      agentsCells.push({ agentPubKey, cellId: cell_id });
    }

    await this.attachAppInterface();
    await this.connectAppInterface();

    return agentsCells;
  }
}
