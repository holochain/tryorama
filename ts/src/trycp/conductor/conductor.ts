import assert from "assert";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import getPort, { portNumbers } from "get-port";
import { AgentHapp, Conductor } from "../../types";
import { TryCpConductorLogLevel, TryCpClient } from "..";
import {
  AddAgentInfoRequest,
  AgentPubKey,
  AppBundleSource,
  AppInfoRequest,
  AppSignalCb,
  AttachAppInterfaceRequest,
  CallZomeRequest,
  CreateCloneCellRequest,
  DisableAppRequest,
  DnaHash,
  DnaSource,
  DumpFullStateRequest,
  DumpStateRequest,
  EnableAppRequest,
  InstallAppBundleRequest,
  InstallAppDnaPayload,
  InstallAppRequest,
  ListAppsRequest,
  MembraneProof,
  RegisterDnaRequest,
  RequestAgentInfoRequest,
  StartAppRequest,
  UninstallAppRequest,
} from "@holochain/client";
import {
  TRYCP_SUCCESS_RESPONSE,
  RequestAdminInterfaceData,
  RequestCallAppInterfaceMessage,
} from "../types";
import { deserializeZomeResponsePayload } from "../util";
import { FullStateDump } from "@holochain/client/lib/api/state-dump";
import { makeLogger } from "../../logger";
import { URL } from "url";
import { enableAgentHapp } from "../../util";

const logger = makeLogger("TryCP conductor");

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
  timeout?: number;
}

/**
 * The function to create a TryCP Conductor (aka "Player").
 *
 * @param serverUrl - The URL of the TryCP server to connect to.
 * @param options - Optional parameters to name, configure and start the
 * Conductor as well as clean all existing conductors. `cleanAllConductors` is
 * `true` by default, as `startup`.
 * @returns A configured Conductor instance.
 *
 * @public
 */
export const createTryCpConductor = async (
  serverUrl: URL,
  options?: TryCpConductorOptions
) => {
  const client = await TryCpClient.create(serverUrl, options?.timeout);
  const conductor = new TryCpConductor(client, options?.id);
  if (options?.startup !== false) {
    // configure and startup conductor by default
    await conductor.configure(options?.partialConfig);
    await conductor.startUp({ logLevel: options?.logLevel });
  }
  return conductor;
};

/**
 * @public
 */
export class TryCpConductor implements Conductor {
  private readonly id: string;
  private readonly tryCpClient: TryCpClient;
  private appInterfacePort: undefined | number;

  constructor(tryCpClient: TryCpClient, id?: ConductorId) {
    this.tryCpClient = tryCpClient;
    this.id = id || `conductor-${uuidv4()}`;
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
  async startUp(options?: { logLevel?: TryCpConductorLogLevel }) {
    const response = await this.tryCpClient.call({
      type: "startup",
      id: this.id,
      log_level: options?.logLevel,
    });
    assert(response === TRYCP_SUCCESS_RESPONSE);
    return response;
  }

  async shutDown() {
    if (this.appInterfacePort) {
      const response = await this.disconnectAppInterface();
      assert(response === TRYCP_SUCCESS_RESPONSE);
    }
    const response = await this.tryCpClient.call({
      type: "shutdown",
      id: this.id,
    });
    assert(response === TRYCP_SUCCESS_RESPONSE);
    return response;
  }

  async disconnectClient() {
    const response = await this.tryCpClient.close();
    assert(response === 1000);
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

  async connectAppInterface(signalHandler?: AppSignalCb) {
    assert(this.appInterfacePort, "no app interface attached to conductor");
    const response = await this.tryCpClient.call({
      type: "connect_app_interface",
      port: this.appInterfacePort,
    });
    assert(response === TRYCP_SUCCESS_RESPONSE);
    this.tryCpClient.setSignalHandler(this.appInterfacePort, signalHandler);
    return response;
  }

  async disconnectAppInterface() {
    assert(this.appInterfacePort, "no app interface attached");
    const response = await this.tryCpClient.call({
      type: "disconnect_app_interface",
      port: this.appInterfacePort,
    });
    assert(response === TRYCP_SUCCESS_RESPONSE);
    return response;
  }

  private async callAdminApi(message: RequestAdminInterfaceData) {
    const response = await this.tryCpClient.call({
      type: "call_admin_interface",
      id: this.id,
      message,
    });
    assert(response !== TRYCP_SUCCESS_RESPONSE);
    assert(typeof response !== "string");
    return response;
  }

  adminWs() {
    const registerDna = async (
      request: RegisterDnaRequest & DnaSource
    ): Promise<DnaHash> => {
      const response = await this.callAdminApi({
        type: "register_dna",
        data: request,
      });
      assert(response.type === "dna_registered");
      return response.data;
    };

    const generateAgentPubKey = async (): Promise<AgentPubKey> => {
      const response = await this.callAdminApi({
        type: "generate_agent_pub_key",
      });
      assert(response.type === "agent_pub_key_generated");
      return response.data;
    };

    const installApp = async (data: InstallAppRequest) => {
      const response = await this.callAdminApi({
        type: "install_app",
        data,
      });
      assert(response.type === "app_installed");
      return response.data;
    };

    const installAppBundle = async (data: InstallAppBundleRequest) => {
      const response = await this.callAdminApi({
        type: "install_app_bundle",
        data,
      });
      assert(response.type === "app_bundle_installed");
      return response.data;
    };

    const enableApp = async (request: EnableAppRequest) => {
      const response = await this.callAdminApi({
        type: "enable_app",
        data: request,
      });
      assert(response.type === "app_enabled");
      return response.data;
    };

    const disableApp = async (request: DisableAppRequest) => {
      const response = await this.callAdminApi({
        type: "disable_app",
        data: request,
      });
      assert(response.type === "app_disabled");
      return response.data;
    };

    const startApp = async (request: StartAppRequest) => {
      const response = await this.callAdminApi({
        type: "start_app",
        data: request,
      });
      assert(response.type === "app_started");
      return response.data;
    };

    const uninstallApp = async (request: UninstallAppRequest) => {
      const response = await this.callAdminApi({
        type: "uninstall_app",
        data: request,
      });
      assert(response.type === "app_uninstalled");
      return response.data;
    };

    const createCloneCell = async (request: CreateCloneCellRequest) => {
      const response = await this.callAdminApi({
        type: "create_clone_cell",
        data: request,
      });
      assert(response.type === "clone_cell_created");
      return response.data;
    };

    const listApps = async (request: ListAppsRequest) => {
      const response = await this.callAdminApi({
        type: "list_apps",
        data: request,
      });
      assert(response.type === "apps_listed");
      return response.data;
    };

    const listCellIds = async () => {
      const response = await this.callAdminApi({ type: "list_cell_ids" });
      assert(response.type === "cell_ids_listed");
      return response.data;
    };

    const listDnas = async () => {
      const response = await this.callAdminApi({ type: "list_dnas" });
      assert(response.type === "dnas_listed");
      return response.data;
    };

    const attachAppInterface = async (request?: AttachAppInterfaceRequest) => {
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
    };

    const listAppInterfaces = async () => {
      const response = await this.callAdminApi({ type: "list_app_interfaces" });
      assert(response.type === "app_interfaces_listed");
      return response.data;
    };

    /**
     * Get agent infos, optionally of a particular cell.
     * @param req - The cell id to get agent infos of.
     * @returns The agent infos.
     *
     * @public
     */
    const requestAgentInfo = async (req: RequestAgentInfoRequest) => {
      const response = await this.callAdminApi({
        type: "request_agent_info",
        data: {
          cell_id: req.cell_id || null,
        },
      });
      assert(response.type === "agent_info_requested");
      return response.data;
    };

    /**
     * Add agents to a conductor.
     * @param request - The agents to add to the conductor.
     *
     * @public
     */
    const addAgentInfo = async (request: AddAgentInfoRequest) => {
      const response = await this.callAdminApi({
        type: "add_agent_info",
        data: request,
      });
      assert(response.type === "agent_info_added");
      return response;
    };

    /**
     * Request a dump of the cell's state.
     *
     * @param request - The cell id for which state should be dumped.
     * @returns The cell's state as JSON.
     *
     * @public
     */
    const dumpState = async (request: DumpStateRequest) => {
      const response = await this.callAdminApi({
        type: "dump_state",
        data: request,
      });
      assert("data" in response);
      assert(typeof response.data === "string");
      const stateDump = JSON.parse(response.data.replace(/\\n/g, ""));
      return stateDump as [FullStateDump, string];
    };

    /**
     * Request a full state dump of the cell's source chain.
     *
     * @param request - The cell id for which state should be dumped and
     * optionally a DHT Ops cursor.
     * @returns The cell's state as JSON.
     *
     * @public
     */
    const dumpFullState = async (request: DumpFullStateRequest) => {
      const response = await this.callAdminApi({
        type: "dump_full_state",
        data: request,
      });
      assert(response.type === "full_state_dumped");
      return response.data;
    };

    return {
      addAgentInfo,
      attachAppInterface,
      createCloneCell,
      disableApp,
      dumpFullState,
      dumpState,
      enableApp,
      generateAgentPubKey,
      installApp,
      installAppBundle,
      listAppInterfaces,
      listApps,
      listCellIds,
      listDnas,
      registerDna,
      requestAgentInfo,
      startApp,
      uninstallApp,
    };
  }

  /**
   * Call conductor's App API.
   *
   * @internal
   */
  private async callAppApi(message: RequestCallAppInterfaceMessage) {
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

  appWs() {
    /**
     * Request info of an installed hApp.
     *
     * @param installed_app_id - The id of the hApp to query.
     * @returns The app info.
     *
     * @public
     */
    const appInfo = async (request: AppInfoRequest) => {
      const response = await this.callAppApi({
        type: "app_info",
        data: request,
      });
      assert(response.type === "app_info");
      return response.data;
    };

    /**
     * Make a zome call to a conductor through the TryCP server.
     *
     * @param request - The zome call parameters.
     * @returns The result of the zome call.
     *
     * @public
     */
    const callZome = async <T>(request: CallZomeRequest) => {
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
    };

    return { appInfo, callZome };
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
  async installAgentsHapps(options: {
    agentsDnas: DnaSource[][];
    signalHandler?: AppSignalCb;
    uid?: string;
  }) {
    const agentsHapps: AgentHapp[] = [];

    for (const agentDnas of options.agentsDnas) {
      const dnas: InstallAppDnaPayload[] = [];
      const agentPubKey = await this.adminWs().generateAgentPubKey();
      const appId = `app-${uuidv4()}`;
      logger.debug(
        `installing app with id ${appId} for agent ${Buffer.from(
          agentPubKey
        ).toString("base64")}`
      );

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
          const dnaHash = await this.adminWs().registerDna({
            path: relativePath,
            uid: options.uid,
          });
          dnas.push({
            hash: dnaHash,
            role_id: `${dna.path}-${uuidv4()}`,
          });
        } else if ("hash" in dna) {
          const dnaHash = await this.adminWs().registerDna({
            hash: dna.hash,
            uid: options.uid,
          });
          dnas.push({
            hash: dnaHash,
            role_id: `dna-${uuidv4()}`,
          });
        } else {
          const dnaHash = await this.adminWs().registerDna({
            bundle: dna.bundle,
            uid: options.uid,
          });
          dnas.push({
            hash: dnaHash,
            role_id: `${dna.bundle.manifest.name}-${uuidv4()}`,
          });
        }
      }

      const installedAppInfo = await this.adminWs().installApp({
        installed_app_id: appId,
        agent_key: agentPubKey,
        dnas,
      });

      const agentHapp = await enableAgentHapp(
        this,
        agentPubKey,
        installedAppInfo
      );
      agentsHapps.push(agentHapp);
    }

    await this.adminWs().attachAppInterface();
    await this.connectAppInterface(options.signalHandler);

    return agentsHapps;
  }

  async installHappBundle(
    appBundleSource: AppBundleSource,
    options?: {
      agentPubKey?: AgentPubKey;
      installedAppId?: string;
      uid?: string;
      membraneProofs?: Record<string, MembraneProof>;
    }
  ) {
    const agentPubKey =
      options?.agentPubKey ?? (await this.adminWs().generateAgentPubKey());
    const appBundleOptions: InstallAppBundleRequest = Object.assign(
      appBundleSource,
      {
        agent_key: agentPubKey,
        membrane_proofs: options?.membraneProofs ?? {},
        uid: options?.uid,
        installed_app_id: options?.installedAppId ?? `app-${uuidv4()}`,
      }
    );
    const installedAppInfo = await this.adminWs().installAppBundle(
      appBundleOptions
    );

    const agentHapp = await enableAgentHapp(
      this,
      agentPubKey,
      installedAppInfo
    );
    return agentHapp;
  }
}

export const cleanAllTryCpConductors = async (serverUrl: URL) => {
  const client = await TryCpClient.create(serverUrl);
  const response = await client.call({ type: "reset" });
  assert(response === TRYCP_SUCCESS_RESPONSE);
  await client.close();
  return response;
};
