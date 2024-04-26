import {
  AddAgentInfoRequest,
  AgentInfoRequest,
  AgentPubKey,
  AppAuthenticationToken,
  AppBundleSource,
  AppCallZomeRequest,
  AppInfo,
  AppSignalCb,
  AttachAppInterfaceRequest,
  CallZomeRequest,
  CallZomeRequestSigned,
  CapSecret,
  CellId,
  CellType,
  CreateCloneCellRequest,
  DeleteCloneCellRequest,
  DisableAppRequest,
  DisableCloneCellRequest,
  DnaDefinition,
  DnaHash,
  DnaSource,
  DumpFullStateRequest,
  DumpNetworkStatsRequest,
  DumpStateRequest,
  EnableAppRequest,
  EnableCloneCellRequest,
  encodeHashToBase64,
  FullStateDump,
  generateSigningKeyPair,
  GetDnaDefinitionRequest,
  getSigningCredentials,
  GrantedFunctions,
  GrantedFunctionsType,
  GrantZomeCallCapabilityRequest,
  HolochainError,
  InstallAppRequest,
  InstalledAppId,
  IssueAppAuthenticationTokenRequest,
  ListAppsRequest,
  NetworkInfoRequest,
  randomCapSecret,
  RegisterDnaRequest,
  RoleName,
  setSigningCredentials,
  signZomeCall,
  StartAppRequest,
  StorageInfoRequest,
  UninstallAppRequest,
  UpdateCoordinatorsRequest,
} from "@holochain/client";
import getPort, { portNumbers } from "get-port";
import assert from "node:assert";
import { URL } from "node:url";
import { v4 as uuidv4 } from "uuid";
import { makeLogger } from "../../logger.js";
import { AgentsAppsOptions, AppOptions, IConductor } from "../../types.js";
import {
  AdminApiResponseAppAuthenticationTokenIssued,
  TryCpClient,
  TryCpConductorLogLevel,
} from "../index.js";
import {
  AdminApiResponseAgentInfo,
  AdminApiResponseAgentPubKeyGenerated,
  AdminApiResponseAppDisabled,
  AdminApiResponseAppEnabled,
  AdminApiResponseAppInstalled,
  AdminApiResponseAppInterfaceAttached,
  AdminApiResponseAppInterfacesListed,
  AdminApiResponseAppsListed,
  AdminApiResponseAppStarted,
  AdminApiResponseAppUninstalled,
  AdminApiResponseCellIdsListed,
  AdminApiResponseCoordinatorsUpdated,
  AdminApiResponseDnaRegistered,
  AdminApiResponseDnasDefinitionReturned,
  AdminApiResponseDnasListed,
  AdminApiResponseFullStateDumped,
  AdminApiResponseNetworkStatsDumped,
  AdminApiResponseStorageInfo,
  AppApiResponseAppInfo,
  AppApiResponseCloneCellCreated,
  AppApiResponseCloneCellDisabled,
  AppApiResponseCloneCellEnabled,
  AppApiResponseNetworkInfo,
  RequestAdminInterfaceMessage,
  RequestCallAppInterfaceMessage,
  TRYCP_SUCCESS_RESPONSE,
} from "../types.js";
import { deserializeZomeResponsePayload } from "../util.js";
import { _ALLOWED_ORIGIN } from "../../common.js";

const logger = makeLogger("TryCP conductor");
const HOLO_SIGNALING_SERVER = new URL("wss://signal.holo.host");
const HOLO_BOOTSTRAP_SERVEr = new URL("https://devnet-bootstrap.holo.host");
const BOOTSTRAP_SERVER_PLACEHOLDER = "<bootstrap_server_url>";
const SIGNALING_SERVER_PLACEHOLDER = "<signaling_server_url>";

const CLONE_ID_DELIMITER = ".";

/**
 * The default partial config for a TryCP conductor.
 *
 * @public
 */
export const DEFAULT_PARTIAL_PLAYER_CONFIG = `signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
network:
  network_type: "quic_bootstrap"
  bootstrap_service: ${BOOTSTRAP_SERVER_PLACEHOLDER}
  transport_pool:
    - type: webrtc
      signal_url: ${SIGNALING_SERVER_PLACEHOLDER}`;

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
}

/**
 * The function to create a TryCP Conductor. By default configures and starts
 * it.
 *
 * @param tryCpClient - The client connection to the TryCP server on which to
 * create the conductor.
 * @param options - Options to configure how the conductor will be started and run.
 * @returns A conductor instance.
 *
 * @public
 */
export const createTryCpConductor = async (
  tryCpClient: TryCpClient,
  options?: TryCpConductorOptions
) => {
  const conductor = new TryCpConductor(tryCpClient, options?.id);
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
export class TryCpConductor implements IConductor {
  readonly id: string;
  readonly tryCpClient: TryCpClient;

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
    if (!partialConfig) {
      partialConfig = DEFAULT_PARTIAL_PLAYER_CONFIG.replace(
        BOOTSTRAP_SERVER_PLACEHOLDER,
        (this.tryCpClient.bootstrapServerUrl || HOLO_BOOTSTRAP_SERVEr).href
      ).replace(
        SIGNALING_SERVER_PLACEHOLDER,
        (this.tryCpClient.signalingServerUrl || HOLO_SIGNALING_SERVER).href
      );
    }
    const response = await this.tryCpClient.call({
      type: "configure_player",
      id: this.id,
      partial_config: partialConfig,
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
   * Shut down the conductor.
   *
   * @returns An empty success response.
   *
   * @public
   */
  async shutDown() {
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
   * @param port - The port to attach the app interface to.
   * @returns An empty success response.
   */
  async connectAppInterface(token: AppAuthenticationToken, port: number) {
    const response = await this.tryCpClient.call({
      type: "connect_app_interface",
      token,
      port,
    });
    assert(response === TRYCP_SUCCESS_RESPONSE);
    return response;
  }

  /**
   * Disconnect a web socket from the App API.
   *
   * @param port - The port of the app interface to disconnect.
   * @returns An empty success response.
   */
  async disconnectAppInterface(port: number) {
    const response = await this.tryCpClient.call({
      type: "disconnect_app_interface",
      port,
    });
    assert(response === TRYCP_SUCCESS_RESPONSE);
    return response;
  }

  /**
   * Attach a signal handler.
   *
   * @param signalHandler - The signal handler to register.
   * @param port - The port of the app interface.
   */
  on(port: number, signalHandler: AppSignalCb) {
    this.tryCpClient.setSignalHandler(port, signalHandler);
  }

  /**
   * Detach the registered signal handler.
   */
  off(port: number) {
    this.tryCpClient.unsetSignalHandler(port);
  }

  /**
   * Send a call to the Admin API.
   *
   * @param message - The call to send to the Admin API.
   * @returns The response of the call.
   *
   * @internal
   */
  private async callAdminApi(message: RequestAdminInterfaceMessage) {
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
        type: { register_dna: null },
        data: request,
      });
      assert("dna_registered" in response.type);
      return (response as AdminApiResponseDnaRegistered).data;
    };

    /**
     * Get a DNA definition.
     *
     * @param dnaHash - Hash of DNA to query.
     * @returns The {@link DnaDefinition}.
     */
    const getDnaDefinition = async (
      dnaHash: GetDnaDefinitionRequest
    ): Promise<DnaDefinition> => {
      const response = await this.callAdminApi({
        type: { get_dna_definition: null },
        data: dnaHash,
      });
      assert("dna_definition_returned" in response.type);
      return (response as AdminApiResponseDnasDefinitionReturned).data;
    };

    /**
     * Grant a capability for a zome call.
     *
     * @param request - Public key to grant and cell, zome and functions for
     * which to grant the capability.
     */
    const grantZomeCallCapability = async (
      request: GrantZomeCallCapabilityRequest
    ) => {
      const response = await this.callAdminApi({
        type: { grant_zome_call_capability: null },
        data: request,
      });
      assert("zome_call_capability_granted" in response.type);
    };

    /**
     * Generate a new agent pub key.
     *
     * @returns The generated {@link AgentPubKey}.
     */
    const generateAgentPubKey = async (): Promise<AgentPubKey> => {
      const response = await this.callAdminApi({
        type: { generate_agent_pub_key: null },
      });
      assert("agent_pub_key_generated" in response.type);
      return (response as AdminApiResponseAgentPubKeyGenerated).data;
    };

    /**
     * Install an app.
     *
     * @param data - {@link InstallAppBundleRequest}.
     * @returns {@link @holochain/client#InstalledAppInfo}.
     */
    const installApp = async (data: InstallAppRequest) => {
      const response = await this.callAdminApi({
        type: { install_app: null },
        data,
      });
      assert("app_installed" in response.type);
      return (response as AdminApiResponseAppInstalled).data;
    };

    /**
     * Enable an installed hApp.
     *
     * @param request -{@link EnableAppRequest}.
     * @returns {@link @holochain/client#EnableAppResonse}.
     */
    const enableApp = async (request: EnableAppRequest) => {
      const response = await this.callAdminApi({
        type: { enable_app: null },
        data: request,
      });
      assert("app_enabled" in response.type);
      return (response as AdminApiResponseAppEnabled).data;
    };

    /**
     * Disable an installed hApp.
     *
     * @param request -{@link DisableAppRequest}.
     * @returns An empty success response.
     */
    const disableApp = async (request: DisableAppRequest) => {
      const response = await this.callAdminApi({
        type: { disable_app: null },
        data: request,
      });
      assert("app_disabled" in response.type);
      return (response as AdminApiResponseAppDisabled).data;
    };

    /**
     * Start an installed hApp.
     *
     * @param request -{@link StartAppRequest}.
     * @returns {@link @holochain/client#StartAppResponse}.
     */
    const startApp = async (request: StartAppRequest) => {
      const response = await this.callAdminApi({
        type: { start_app: null },
        data: request,
      });
      assert("app_started" in response.type);
      return (response as AdminApiResponseAppStarted).data;
    };

    /**
     * Uninstall an installed hApp.
     *
     * @param request - {@link UninstallAppRequest}.
     * @returns An empty success response.
     */
    const uninstallApp = async (request: UninstallAppRequest) => {
      const response = await this.callAdminApi({
        type: { uninstall_app: null },
        data: request,
      });
      assert("app_uninstalled" in response.type);
      return (response as AdminApiResponseAppUninstalled).data;
    };

    /**
     * Update coordinator zomes of an installed DNA.
     *
     * @param request - {@link UninstallAppRequest}.
     * @returns An empty success response.
     */
    const updateCoordinators = async (request: UpdateCoordinatorsRequest) => {
      const response = await this.callAdminApi({
        type: { update_coordinators: null },
        data: request,
      });
      assert("coordinators_updated" in response.type);
      return (response as AdminApiResponseCoordinatorsUpdated).data;
    };

    /**
     * List all installed hApps.
     *
     * @param request - Filter by hApp status (optional).
     * @returns A list of all installed hApps.
     */
    const listApps = async (request: ListAppsRequest) => {
      const response = await this.callAdminApi({
        type: { list_apps: null },
        data: request,
      });
      assert("apps_listed" in response.type);
      return (response as AdminApiResponseAppsListed).data;
    };

    /**
     * List all installed Cell ids.
     *
     * @returns A list of all installed {@link Cell} ids.
     */
    const listCellIds = async () => {
      const response = await this.callAdminApi({
        type: { list_cell_ids: null },
      });
      assert("cell_ids_listed" in response.type);
      return (response as AdminApiResponseCellIdsListed).data;
    };

    /**
     * List all installed DNAs.
     *
     * @returns A list of all installed DNAs' role ids.
     */
    const listDnas = async () => {
      const response = await this.callAdminApi({ type: { list_dnas: null } });
      assert("dnas_listed" in response.type);
      return (response as AdminApiResponseDnasListed).data;
    };

    /**
     * Attach an App interface to the conductor.
     *
     * @param request - The port to attach to.
     * @returns The port the App interface was attached to.
     */
    const attachAppInterface = async (request?: AttachAppInterfaceRequest) => {
      request = {
        allowed_origins: request?.allowed_origins ?? _ALLOWED_ORIGIN,
        port:
          request?.port ?? (await getPort({ port: portNumbers(30000, 40000) })),
      };
      const response = await this.callAdminApi({
        type: { attach_app_interface: null },
        data: request,
      });
      assert("app_interface_attached" in response.type);
      return {
        port: (response as AdminApiResponseAppInterfaceAttached).data.port,
      };
    };

    /**
     * List all App interfaces.
     *
     * @returns A list of all attached App interfaces.
     */
    const listAppInterfaces = async () => {
      const response = await this.callAdminApi({
        type: { list_app_interfaces: null },
      });
      assert("app_interfaces_listed" in response.type);
      return (response as AdminApiResponseAppInterfacesListed).data;
    };

    /**
     * Get agent infos, optionally of a particular cell.
     *
     * @param req - The cell id to get agent infos of (optional).
     * @returns The agent infos.
     */
    const agentInfo = async (req: AgentInfoRequest) => {
      const response = await this.callAdminApi({
        type: { agent_info: null },
        data: {
          cell_id: req.cell_id || null,
        },
      });
      assert("agent_info" in response.type);
      return (response as AdminApiResponseAgentInfo).data;
    };

    /**
     * Add agents to a conductor.
     *
     * @param request - The agents to add to the conductor.
     */
    const addAgentInfo = async (request: AddAgentInfoRequest) => {
      const response = await this.callAdminApi({
        type: { add_agent_info: null },
        data: request,
      });
      assert("agent_info_added" in response.type);
    };

    /**
     * Delete a disabled clone cell.
     *
     * @param request - The app id and clone cell id to delete.
     */
    const deleteCloneCell = async (request: DeleteCloneCellRequest) => {
      const response = await this.callAdminApi({
        type: { delete_clone_cell: null },
        data: request,
      });
      assert("clone_cell_deleted" in response.type);
    };

    /**
     * Request a dump of the cell's state.
     *
     * @param request - The cell id for which state should be dumped.
     * @returns The cell's state as JSON.
     */
    const dumpState = async (request: DumpStateRequest) => {
      const response = await this.callAdminApi({
        type: { dump_state: null },
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
        type: { dump_full_state: null },
        data: request,
      });
      assert("full_state_dumped" in response.type);
      return (response as AdminApiResponseFullStateDumped).data;
    };

    /**
     * Request a network stats dump of the conductor.
     *
     * @param request - {@link DumpNetworkStatsRequest}
     * @returns {@link @holochain/client#DumpNetworkStatsResponse}.
     */
    const dumpNetworkStats = async (request: DumpNetworkStatsRequest) => {
      const response = await this.callAdminApi({
        type: { dump_network_stats: null },
        data: request,
      });
      assert("network_stats_dumped" in response.type);
      return (response as AdminApiResponseNetworkStatsDumped).data;
    };

    /**
     * Request storage info from the conductor.
     *
     * @param request - {@link StorageInfoRequest}
     * @returns {@link @holochain/client#StorageInfoResponse}.
     */
    const storageInfo = async (request: StorageInfoRequest) => {
      const response = await this.callAdminApi({
        type: { storage_info: null },
        data: request,
      });
      assert("storage_info" in response.type);
      return (response as AdminApiResponseStorageInfo).data;
    };

    const issueAppAuthenticationToken = async (
      request: IssueAppAuthenticationTokenRequest
    ) => {
      const response = await this.callAdminApi({
        type: { issue_app_authentication_token: null },
        data: request,
      });
      assert("app_authentication_token_issued" in response.type);
      return (response as AdminApiResponseAppAuthenticationTokenIssued).data;
    };

    /**
     * Grant a capability for signing zome calls.
     *
     * @param cellId - The cell to grant the capability for.
     * @param functions - The zome functions to grant the capability for.
     * @param signingKey - The assignee of the capability.
     * @returns The cap secret of the created capability.
     */
    const grantSigningKey = async (
      cellId: CellId,
      functions: GrantedFunctions,
      signingKey: AgentPubKey
    ): Promise<CapSecret> => {
      const capSecret = await randomCapSecret();
      await grantZomeCallCapability({
        cell_id: cellId,
        cap_grant: {
          tag: "zome-call-signing-key",
          functions,
          access: {
            Assigned: {
              secret: capSecret,
              assignees: [signingKey],
            },
          },
        },
      });
      return capSecret;
    };

    /**
     * Generate and authorize a new key pair for signing zome calls.
     *
     * @param cellId - The cell id to create the capability grant for.
     * @param functions - Zomes and functions to authorize the signing key for.
     */
    const authorizeSigningCredentials = async (
      cellId: CellId,
      functions?: GrantedFunctions
    ) => {
      const [keyPair, signingKey] = await generateSigningKeyPair();
      const capSecret = await grantSigningKey(
        cellId,
        functions || { [GrantedFunctionsType.All]: null },
        signingKey
      );
      setSigningCredentials(cellId, { capSecret, keyPair, signingKey });
    };

    return {
      addAgentInfo,
      agentInfo,
      attachAppInterface,
      authorizeSigningCredentials,
      deleteCloneCell,
      disableApp,
      dumpFullState,
      dumpNetworkStats,
      dumpState,
      enableApp,
      generateAgentPubKey,
      getDnaDefinition,
      grantSigningKey,
      grantZomeCallCapability,
      installApp,
      listAppInterfaces,
      listApps,
      listCellIds,
      listDnas,
      registerDna,
      startApp,
      storageInfo,
      uninstallApp,
      updateCoordinators,
      issueAppAuthenticationToken,
    };
  }

  /**
   * Call to the conductor's App API.
   */
  private async callAppApi(
    port: number,
    message: RequestCallAppInterfaceMessage
  ) {
    const response = await this.tryCpClient.call({
      type: "call_app_interface",
      port,
      message,
    });
    assert(response !== TRYCP_SUCCESS_RESPONSE);
    assert(typeof response !== "string");
    return response;
  }

  /**
   * Get all
   * {@link https://github.com/holochain/holochain-client-js/blob/develop/docs/API_appwebsocket.md | App API methods}
   * of the Holochain client.
   *
   * @returns The App API web socket.
   */
  async connectAppWs(_token: AppAuthenticationToken, port: number) {
    /**
     * Request info of the installed hApp.
     *
     * @returns The app info.
     */
    const appInfo = async () => {
      const response = await this.callAppApi(port, {
        type: { app_info: null },
      });
      assert("app_info" in response.type);
      return (response as AppApiResponseAppInfo).data;
    };

    /**
     * Make a zome call to a cell in the conductor.
     *
     * @param request - {@link CallZomeRequest}.
     * @returns The result of the zome call.
     */
    const callZome = async <T>(
      request: CallZomeRequest | CallZomeRequestSigned
    ) => {
      // authorize signing credentials
      if (!getSigningCredentials(request.cell_id)) {
        await this.adminWs().authorizeSigningCredentials(request.cell_id);
      }

      let signedRequest: CallZomeRequestSigned;
      if ("signature" in request) {
        signedRequest = request;
      } else {
        // sign zome call
        const signingCredentials = getSigningCredentials(request.cell_id);
        if (!signingCredentials) {
          throw new Error(
            `cannot sign zome call: no signing credentials have been authorized for cell ${request.cell_id}`
          );
        }
        const signedZomeCall = await signZomeCall(request);
        signedRequest = signedZomeCall;
      }
      const response = await this.callAppApi(port, {
        type: { call_zome: null },
        data: signedRequest,
      });
      assert("data" in response);
      assert(response.data);
      assert("BYTES_PER_ELEMENT" in response.data);
      const deserializedPayload = deserializeZomeResponsePayload<T>(
        response.data
      );
      return deserializedPayload;
    };

    /**
     * Create a clone cell of an existing DNA.
     *
     * @param request - Clone cell params.
     * @returns The clone id and cell id of the created clone cell.
     */
    const createCloneCell = async (request: CreateCloneCellRequest) => {
      const response = await this.callAppApi(port, {
        type: { create_clone_cell: null },
        data: request,
      });
      assert("clone_cell_created" in response.type);
      return (response as AppApiResponseCloneCellCreated).data;
    };

    /**
     * Enable a disabled clone cell.
     *
     * @param request - The clone id or cell id of the clone cell to be
     * enabled.
     * @returns The enabled clone cell's clone id and cell id.
     */
    const enableCloneCell = async (request: EnableCloneCellRequest) => {
      const response = await this.callAppApi(port, {
        type: { enable_clone_cell: null },
        data: request,
      });
      assert("clone_cell_enabled" in response.type);
      return (response as AppApiResponseCloneCellEnabled).data;
    };

    /**
     * Archive an existing clone cell.
     *
     * @param request - The hApp id to query.
     * @returns An empty success response.
     */
    const disableCloneCell = async (request: DisableCloneCellRequest) => {
      const response = await this.callAppApi(port, {
        type: { disable_clone_cell: null },
        data: request,
      });
      assert("clone_cell_disabled" in response.type);
      return (response as AppApiResponseCloneCellDisabled).data;
    };

    /**
     * Request network info.
     *
     * @param request - {@link NetworkInfoRequest}.
     * @returns {@link NetworkInfoResponse}.
     */
    const networkInfo = async (request: NetworkInfoRequest) => {
      const response = await this.callAppApi(port, {
        type: { network_info: null },
        data: request,
      });
      assert("network_info" in response.type);
      return (response as AppApiResponseNetworkInfo).data;
    };

    return {
      appInfo,
      callZome,
      createCloneCell,
      enableCloneCell,
      disableCloneCell,
      networkInfo,
    };
  }

  private isCloneId(roleName: RoleName) {
    return roleName.includes(CLONE_ID_DELIMITER);
  }

  private getBaseRoleNameFromCloneId(roleName: RoleName) {
    if (!this.isCloneId(roleName)) {
      throw new Error(
        "invalid clone id: no clone id delimiter found in role name"
      );
    }
    return roleName.split(CLONE_ID_DELIMITER)[0];
  }

  private getCellIdFromRoleName(roleName: RoleName, appInfo: AppInfo) {
    if (this.isCloneId(roleName)) {
      const baseRoleName = this.getBaseRoleNameFromCloneId(roleName);
      if (!(baseRoleName in appInfo.cell_info)) {
        throw new Error(`No cell found with role_name ${roleName}`);
      }
      const cloneCell = appInfo.cell_info[baseRoleName].find(
        (c) => CellType.Cloned in c && c[CellType.Cloned].clone_id === roleName
      );
      if (!cloneCell || !(CellType.Cloned in cloneCell)) {
        throw new Error(`No clone cell found with clone id ${roleName}`);
      }
      return cloneCell[CellType.Cloned].cell_id;
    }
    if (!(roleName in appInfo.cell_info)) {
      throw new Error(`No cell found with role_name ${roleName}`);
    }
    const cell = appInfo.cell_info[roleName].find(
      (c) => CellType.Provisioned in c
    );
    if (!cell || !(CellType.Provisioned in cell)) {
      throw new Error(`No provisioned cell found with role_name ${roleName}`);
    }
    return cell[CellType.Provisioned].cell_id;
  }

  async connectAppAgentWs(port: number, appId: InstalledAppId) {
    const appWs = await this.connectAppWs([], port);
    let cachedAppInfo = await appWs.appInfo();

    const appInfo = appWs.appInfo.bind(appWs);
    appWs.appInfo = async () => {
      const currentAppInfo = await appInfo();
      if (!currentAppInfo) {
        throw new HolochainError(
          "AppNotFound",
          `App info not found for the provided id "${appId}". App needs to be installed and enabled.`
        );
      }
      cachedAppInfo = currentAppInfo;
      return currentAppInfo;
    };

    const callZome = appWs.callZome.bind(appWs);
    appWs.callZome = async (request: AppCallZomeRequest) => {
      if (!cachedAppInfo) {
        throw new HolochainError(
          "AppNotFound",
          `App info not found for the provided id "${appId}". App needs to be installed and enabled.`
        );
      }
      if ("role_name" in request && request.role_name) {
        const cell_id = this.getCellIdFromRoleName(
          request.role_name,
          cachedAppInfo
        );

        const zomeCallPayload = {
          ...request,
          provenance: cachedAppInfo.agent_pub_key,
          cell_id,
        };
        // eslint-disable-next-line
        // @ts-ignore
        delete zomeCallPayload.role_name;
        return callZome(zomeCallPayload);
      } else if ("cell_id" in request && request.cell_id) {
        request = {
          ...request,
          provenance:
            "provenance" in request
              ? request.provenance
              : cachedAppInfo.agent_pub_key,
        };
        // eslint-disable-next-line
        // @ts-ignore
        return callZome(request);
      }
      throw new Error("callZome requires a role_name or cell_id arg");
    };

    return appWs;
  }

  /**
   * Install a hApp bundle into the conductor.
   *
   * @param appBundleSource - The bundle or path to the bundle.
   * @param options - {@link AppOptions} for the hApp bundle (optional).
   * @returns The installed app info.
   */
  async installApp(appBundleSource: AppBundleSource, options?: AppOptions) {
    const agent_key =
      options?.agentPubKey ?? (await this.adminWs().generateAgentPubKey());
    const membrane_proofs = options?.membraneProofs ?? {};
    const installed_app_id = options?.installedAppId ?? `app-${uuidv4()}`;
    const network_seed = options?.networkSeed;
    const installAppRequest: InstallAppRequest =
      "bundle" in appBundleSource
        ? {
            bundle: appBundleSource.bundle,
            agent_key,
            membrane_proofs,
            installed_app_id,
            network_seed,
          }
        : {
            path: appBundleSource.path,
            agent_key,
            membrane_proofs,
            installed_app_id,
            network_seed,
          };
    return this.adminWs().installApp(installAppRequest);
  }

  /**
   * Install a hApp bundle into the conductor.
   *
   * @param options - Apps to install for each agent, with agent pub keys etc.
   * @returns The installed app infos.
   */
  async installAgentsApps(options: AgentsAppsOptions) {
    return Promise.all(
      options.agentsApps.map(async (appForAgent) => {
        const agent_key =
          appForAgent.agentPubKey ??
          (await this.adminWs().generateAgentPubKey());
        const membrane_proofs = appForAgent.membraneProofs ?? {};
        const installed_app_id = options.installedAppId ?? `app-${uuidv4()}`;
        const network_seed = options.networkSeed;
        const installAppRequest: InstallAppRequest =
          "bundle" in appForAgent.app
            ? {
                bundle: appForAgent.app.bundle,
                agent_key,
                membrane_proofs,
                installed_app_id,
                network_seed,
              }
            : {
                path: appForAgent.app.path,
                agent_key,
                membrane_proofs,
                installed_app_id,
                network_seed,
              };

        logger.debug(
          `installing app with id ${installed_app_id} for agent ${encodeHashToBase64(
            agent_key
          )}`
        );
        return this.adminWs().installApp(installAppRequest);
      })
    );
  }
}
