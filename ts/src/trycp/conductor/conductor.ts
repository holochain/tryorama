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
import { makeLogger } from "../../logger";
import { URL } from "url";
import { enableAndGetAgentHapp } from "../../common";
import { FullStateDump } from "@holochain/client/lib/api/state-dump";

const logger = makeLogger("TryCP conductor");

/**
 * The default partial config for a TryCP conductor.
 *
 * @public
 */
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
  /**
   * Identifier for the conductor (optional).
   */
  id?: ConductorId;

  /**
   * Configuration for the conductor (optional).
   */
  partialConfig?: string;

  /**
   * Start up conductor after creation.
   *
   * default: true
   */
  startup?: boolean;

  /**
   * Log level of the conductor (optional).
   *
   * default: "info"
   */
  logLevel?: TryCpConductorLogLevel;

  /**
   * Timeout for requests to Admin and App API.
   */
  timeout?: number;
}

/**
 * The function to create a TryCP Conductor (aka "Player").
 *
 * @param serverUrl - The URL of the TryCP server to connect to.
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
 * A class to manage a conductor running on a TryCP server.
 *
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

  /**
   * Create conductor configuration.
   *
   * @param partialConfig - The configuration to add to the default configuration.
   * @returns An empty success response.
   */
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
   * @param options - Log level of the conductor. Defaults to "info".
   * @returns An empty success response.
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

  /**
   * Disconnect App interface and shut down the conductor.
   *
   * @returns An empty success response.
   *
   * @public
   */
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

  /**
   * Disconnect the TryCP client from the TryCP server.
   *
   * @returns The web socket close code.
   */
  async disconnectClient() {
    const response = await this.tryCpClient.close();
    assert(response === 1000);
    return response;
  }

  /**
   * Download a DNA from a URL to the server's file system.
   *
   * @returns The relative path to the downloaded DNA file.
   */
  async downloadDna(url: URL) {
    const response = await this.tryCpClient.call({
      type: "download_dna",
      url: url.href,
    });
    assert(typeof response === "string");
    return response;
  }

  /**
   * Upload a DNA file from the local file system to the server.
   *
   * @param dnaContent - The DNA as binary content.
   * @returns The relative path to the saved DNA file.
   */
  async saveDna(dnaContent: Buffer) {
    const response = await this.tryCpClient.call({
      type: "save_dna",
      id: "./entry.dna",
      content: dnaContent,
    });
    assert(typeof response === "string");
    return response;
  }

  /**
   * Connect a web socket to the App API.
   *
   * @param signalHandler - A callback function to handle signals.
   * @returns An empty success response.
   */
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

  /**
   * Disconnect the web socket from the App API.
   *
   * @returns An empty success response.
   */
  async disconnectAppInterface() {
    assert(this.appInterfacePort, "no app interface attached");
    const response = await this.tryCpClient.call({
      type: "disconnect_app_interface",
      port: this.appInterfacePort,
    });
    assert(response === TRYCP_SUCCESS_RESPONSE);
    return response;
  }

  /**
   * Send a call to the Admin API.
   *
   * @param message - The call to send to the Admin API.
   * @returns The response of the call.
   *
   * @internal
   */
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

  /**
   * Get all
   * {@link https://github.com/holochain/holochain-client-js/blob/develop/docs/API_adminwebsocket.md | Admin API methods}
   * of the Holochain client.
   *
   * @returns The Admin API web socket.
   */
  adminWs() {
    /**
     * Upload and register a DNA file.
     *
     * @param request - {@link RegisterDnaRequest} & {@link DnaSource}
     * @returns The registered DNA's {@link HoloHash}.
     */
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

    /**
     * Generate a new agent pub key.
     *
     * @returns The generated {@link AgentPubKey}.
     */
    const generateAgentPubKey = async (): Promise<AgentPubKey> => {
      const response = await this.callAdminApi({
        type: "generate_agent_pub_key",
      });
      assert(response.type === "agent_pub_key_generated");
      return response.data;
    };

    /**
     * Install a hApp consisting of a set of DNAs.
     *
     * @param data - {@link InstallAppRequest}.
     * @returns {@link @holochain/client#InstalledAppInfo}.
     */
    const installApp = async (data: InstallAppRequest) => {
      const response = await this.callAdminApi({
        type: "install_app",
        data,
      });
      assert(response.type === "app_installed");
      return response.data;
    };

    /**
     * Install a bundled hApp.
     *
     * @param data - {@link InstallAppBundleRequest}.
     * @returns {@link @holochain/client#InstalledAppInfo}.
     */
    const installAppBundle = async (data: InstallAppBundleRequest) => {
      const response = await this.callAdminApi({
        type: "install_app_bundle",
        data,
      });
      assert(response.type === "app_bundle_installed");
      return response.data;
    };

    /**
     * Enable an installed hApp.
     *
     * @param request -{@link EnableAppRequest}.
     * @returns {@link @holochain/client#EnableAppResonse}.
     */
    const enableApp = async (request: EnableAppRequest) => {
      const response = await this.callAdminApi({
        type: "enable_app",
        data: request,
      });
      assert(response.type === "app_enabled");
      return response.data;
    };

    /**
     * Disable an installed hApp.
     *
     * @param request -{@link DisableAppRequest}.
     * @returns An empty success response.
     */
    const disableApp = async (request: DisableAppRequest) => {
      const response = await this.callAdminApi({
        type: "disable_app",
        data: request,
      });
      assert(response.type === "app_disabled");
      return response.data;
    };

    /**
     * Start an installed hApp.
     *
     * @param request -{@link StartAppRequest}.
     * @returns {@link @holochain/client#StartAppResponse}.
     */
    const startApp = async (request: StartAppRequest) => {
      const response = await this.callAdminApi({
        type: "start_app",
        data: request,
      });
      assert(response.type === "app_started");
      return response.data;
    };

    /**
     * Uninstall an installed hApp.
     *
     * @param request - {@link UninstallAppRequest}.
     * @returns An empty success response.
     */
    const uninstallApp = async (request: UninstallAppRequest) => {
      const response = await this.callAdminApi({
        type: "uninstall_app",
        data: request,
      });
      assert(response.type === "app_uninstalled");
      return response.data;
    };

    /**
     * Clone an existing cell.
     *
     * @param request - {@link CreateCloneCellRequest}.
     * @returns The {@link CellId} of the cloned cell.
     */
    const createCloneCell = async (request: CreateCloneCellRequest) => {
      const response = await this.callAdminApi({
        type: "create_clone_cell",
        data: request,
      });
      assert(response.type === "clone_cell_created");
      return response.data;
    };

    /**
     * List all installed hApps.
     *
     * @param request - Filter by hApp status (optional).
     * @returns A list of all installed hApps.
     */
    const listApps = async (request: ListAppsRequest) => {
      const response = await this.callAdminApi({
        type: "list_apps",
        data: request,
      });
      assert(response.type === "apps_listed");
      return response.data;
    };

    /**
     * List all installed Cell ids.
     *
     * @returns A list of all installed {@link Cell} ids.
     */
    const listCellIds = async () => {
      const response = await this.callAdminApi({ type: "list_cell_ids" });
      assert(response.type === "cell_ids_listed");
      return response.data;
    };

    /**
     * List all installed DNAs.
     *
     * @returns A list of all installed DNAs' role ids.
     */
    const listDnas = async () => {
      const response = await this.callAdminApi({ type: "list_dnas" });
      assert(response.type === "dnas_listed");
      return response.data;
    };

    /**
     * Attach an App interface to the conductor.
     *
     * @param request - The port to attach to.
     * @returns The port the App interface was attached to.
     */
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

    /**
     * List all App interfaces.
     *
     * @returns A list of all attached App interfaces.
     */
    const listAppInterfaces = async () => {
      const response = await this.callAdminApi({ type: "list_app_interfaces" });
      assert(response.type === "app_interfaces_listed");
      return response.data;
    };

    /**
     * Get agent infos, optionally of a particular cell.
     *
     * @param req - The cell id to get agent infos of (optional).
     * @returns The agent infos.
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
     *
     * @param request - The agents to add to the conductor.
     * @returns A confirmation without any data.
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
     * @param request - {@link DumpFullStateRequest}
     * @returns {@link @holochain/client#FullStateDump}.
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
   * Call to the conductor's App API.
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

  /**
   * Get all
   * {@link https://github.com/holochain/holochain-client-js/blob/develop/docs/API_appwebsocket.md | App API methods}
   * of the Holochain client.
   *
   * @returns The App API web socket.
   */
  appWs() {
    /**
     * Request info of an installed hApp.
     *
     * @param request - The hApp id to query.
     * @returns The app info.
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
     * Make a zome call to a cell in the conductor.
     *
     * @param request - {@link CallZomeRequest}.
     * @returns The result of the zome call.
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
   * Install a set of DNAs for multiple agents into the conductor.
   *
   * @param options - An array of DNAs for each agent, resulting in a
   * 2-dimensional array, and a UID for the DNAs (optional).
   * @returns An array with each agent's hApp.
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

      const agentHapp = await enableAndGetAgentHapp(
        this,
        agentPubKey,
        installedAppInfo
      );
      agentsHapps.push(agentHapp);
    }

    return agentsHapps;
  }

  /**
   * Install a hApp bundle into the conductor.
   *
   * @param appBundleSource - The bundle or path to the bundle.
   * @param options - {@link HappBundleOptions} for the hApp bundle (optional).
   * @returns A hApp for the agent.
   */
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

    const agentHapp = await enableAndGetAgentHapp(
      this,
      agentPubKey,
      installedAppInfo
    );
    return agentHapp;
  }
}

/**
 * Run the `reset` command on the TryCP server to delete all conductor data.
 *
 * @param serverUrl - The TryCP server to connect to.
 * @returns An empty success response.
 *
 * @public
 */
export const cleanAllTryCpConductors = async (serverUrl: URL) => {
  const client = await TryCpClient.create(serverUrl);
  const response = await client.call({ type: "reset" });
  assert(response === TRYCP_SUCCESS_RESPONSE);
  await client.close();
  return response;
};
