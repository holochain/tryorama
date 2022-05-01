import assert from "assert";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import getPort, { portNumbers } from "get-port";
import { AgentCells, Conductor } from "../../types";
import { TryCpConductorLogLevel, TryCpClient } from "..";
import {
  AddAgentInfoRequest,
  AgentPubKey,
  AttachAppInterfaceRequest,
  CallZomeRequest,
  DnaHash,
  DnaSource,
  DumpFullStateRequest,
  DumpStateRequest,
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
import { FullStateDump } from "@holochain/client/lib/api/state-dump";

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
 * Conductor as well as clean all existing conductors. `cleanAllConductors` is
 * `true` by default, as `startup`.
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
  if (options?.cleanAllConductors !== false) {
    // clean all conductors by default
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

  /**
   * Start a configured conductor.
   *
   * @param log_level - Defaults to "info" on the TryCP server.
   *
   * @public
   */
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
    // assert("path" in request);
    const response = await this.callAdminApi({
      type: "register_dna",
      data: request,
    });
    assert(response.type === "dna_registered");
    return response.data;
  }

  async generateAgentPubKey(): Promise<AgentPubKey> {
    const response = await this.callAdminApi({
      type: "generate_agent_pub_key",
    });
    assert(response.type === "agent_pub_key_generated");
    return response.data;
  }

  async installApp(data: InstallAppRequest) {
    const response = await this.callAdminApi({
      type: "install_app",
      data,
    });
    assert(response.type === "app_installed");
    return response.data;
  }

  async enableApp(request: EnableAppRequest): Promise<EnableAppResponse> {
    const response = await this.callAdminApi({
      type: "enable_app",
      data: request,
    });
    assert(response.type === "app_enabled");
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
    assert(response.type === "app_interface_attached");
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
   * @param req - The cell id to get agent infos of.
   * @returns The agent infos.
   *
   * @public
   */
  async requestAgentInfo(req: RequestAgentInfoRequest) {
    const response = await this.callAdminApi({
      type: "request_agent_info",
      data: {
        cell_id: req.cell_id || null,
      },
    });
    assert(response.type === "agent_info_requested");
    return response.data;
  }

  /**
   * Add agents to a conductor.
   * @param request - The agents to add to the conductor.
   *
   * @public
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
   * Request a dump of the cell's state.
   *
   * @param request - The cell id for which state should be dumped.
   * @returns The cell's state as JSON.
   *
   * @public
   */
  async dumpState(request: DumpStateRequest) {
    const response = await this.callAdminApi({
      type: "dump_state",
      data: request,
    });
    assert("data" in response);
    assert(typeof response.data === "string");
    const stateDump = JSON.parse(response.data.replace(/\\n/g, ""));
    return stateDump as [FullStateDump, string];
  }

  /**
   * Request a full state dump of the cell's source chain.
   *
   * @param request - The cell id for which state should be dumped and
   * optionally a DHT Ops cursor.
   * @returns The cell's state as JSON.
   *
   * @public
   */
  async dumpFullState(request: DumpFullStateRequest) {
    const response = await this.callAdminApi({
      type: "dump_full_state",
      data: request,
    });
    assert(response.type === "full_state_dumped");
    return response.data;
  }

  /**
   * Call conductor's App API.
   *
   * @public
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
   *
   * @public
   */
  async appInfo(installed_app_id: string) {
    const response = await this.callAppApi({
      type: "app_info",
      data: { installed_app_id },
    });
    assert(response.type === "app_info");
    return response.data;
  }

  /**
   * Make a zome call to a conductor through the TryCP server.
   *
   * @param request - The zome call parameters.
   * @returns The result of the zome call.
   *
   * @public
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

  createUniqueHapp(dnas: DnaSource[]) {
    const uid = uuidv4();
    return { dnas, uid };
  }

  /**
   * Helper to install DNAs and create agents. Given an array of DNAs for each
   * agent to be created, an agentPubKey is generated and the DNAs for the
   * agent are installed.  and handles to the
   * conductor, the cells and the agents are returned.
   *
   * @param options - An array of DNA sources for each agent (= two-dimensional
   * array) and optionally a unique id of the hApp.
   * @returns An array of agents and handles to their created cells (= two-
   * dimensional array).
   *
   * @public
   */
  async installAgentsDnas(options: {
    agentsDnas: DnaSource[][];
    uid?: string;
  }) {
    const agentsCells: AgentCells[] = [];

    for (const agentDnas of options.agentsDnas) {
      const dnaHashes: DnaHash[] = [];
      const agentPubKey = await this.generateAgentPubKey();
      const appId = `app-${uuidv4()}`;

      for (const dna of agentDnas) {
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
          const dnaHash = await this.registerDna({
            path: relativePath,
            uid: options.uid,
          });
          dnaHashes.push(dnaHash);
        } else {
          throw new Error("Not dnaHashed");
        }

        const dnas = dnaHashes.map((dnaHash) => ({
          hash: dnaHash,
          role_id: `dna-${uuidv4()}`,
        }));

        const installedAppInfo = await this.installApp({
          installed_app_id: appId,
          agent_key: agentPubKey,
          dnas,
        });
        await this.enableApp({ installed_app_id: appId });
        const cells = installedAppInfo.cell_data;
        agentsCells.push({ agentPubKey, cells });
      }
    }

    await this.attachAppInterface();
    await this.connectAppInterface();

    return agentsCells;
  }
}
