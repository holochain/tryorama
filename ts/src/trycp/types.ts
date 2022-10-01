import {
  AddAgentInfoRequest,
  AgentInfoSigned,
  AppInfoResponse,
  ArchiveCloneCellRequest,
  ArchiveCloneCellResponse,
  AttachAppInterfaceRequest,
  AttachAppInterfaceResponse,
  CallZomeRequest,
  CellId,
  CreateCloneCellRequest,
  CreateCloneCellResponse,
  DeleteArchivedCloneCellsRequest,
  DeleteArchivedCloneCellsResponse,
  DisableAppRequest,
  DisableAppResponse,
  DumpFullStateRequest,
  DumpStateRequest,
  DumpStateResponse,
  EnableAppRequest,
  EnableAppResponse,
  FullStateDump,
  HoloHash,
  InstallAppBundleRequest,
  InstallAppBundleResponse,
  InstallAppRequest,
  InstalledAppInfo,
  ListAppInterfacesResponse,
  ListAppsRequest,
  ListAppsResponse,
  ListCellIdsResponse,
  ListDnasResponse,
  RegisterDnaRequest,
  RequestAgentInfoRequest,
  RequestAgentInfoResponse,
  RestoreCloneCellRequest,
  RestoreCloneCellResponse,
  StartAppRequest,
  StartAppResponse,
  UninstallAppRequest,
  UninstallAppResponse,
} from "@holochain/client";
import { ConductorId } from "./conductor/index.js";

/**
 * @internal
 */
export interface _TryCpCall {
  id: number;
  request: TryCpRequest;
}

/**
 * Contains all possible request types.
 *
 * @public
 */
export type TryCpRequest =
  | RequestDownloadDna
  | RequestSaveDna
  | RequestConfigurePlayer
  | RequestStartup
  | RequestShutdown
  | RequestReset
  | RequestConnectAppInterface
  | RequestDisconnectAppInterface
  | RequestCallAppInterface
  | RequestCallAppInterfaceEncoded
  | RequestCallAdminInterface;

/**
 * Request to download a DNA from a URL.
 *
 * @param url - from where to download the DNA
 *
 * @public
 */
export interface RequestDownloadDna {
  type: "download_dna";
  url: string;
}

/**
 * Request to save a DNA to the server's file system.
 *
 * @public
 */
export interface RequestSaveDna {
  type: "save_dna";
  id: string;
  content: Buffer;
}

/**
 * Request to create configuration files and directories for a conductor.
 *
 * @public
 */
export interface RequestConfigurePlayer {
  type: "configure_player";
  id: ConductorId;
  partial_config: string;
}

/**
 * Log level for a TryCP conductor.
 *
 * @public
 */
export type TryCpConductorLogLevel =
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "trace";

/**
 * Request startup of a conductor.
 *
 * @public
 */
export interface RequestStartup {
  type: "startup";
  id: ConductorId;
  log_level?: TryCpConductorLogLevel;
}

/**
 * Request shutdown of a conductor.
 *
 * @public
 */
export interface RequestShutdown {
  type: "shutdown";
  id: ConductorId;
  signal?: "SIGTERM" | "SIGKILL" | "SIGINT";
}

/**
 * Request deletion of **all** conductors.
 *
 * @public
 */
export interface RequestReset {
  type: "reset";
}

/**
 * Request to connect an app interface to a conductor.
 *
 * @public
 */
export interface RequestConnectAppInterface {
  type: "connect_app_interface";
  port: number;
}

/**
 * Request to disconnect a connected app interface from a conductor.
 *
 * @public
 */
export interface RequestDisconnectAppInterface {
  type: "disconnect_app_interface";
  port: number;
}

/**
 * Request a call to a conductor's app interface.
 *
 * @public
 */
export interface RequestCallAppInterface {
  type: "call_app_interface";
  port: number;
  message: RequestCallAppInterfaceMessage;
}

/**
 * All possible calls to an app interface.
 *
 * @public
 */
export type RequestCallAppInterfaceMessage =
  | RequestCallZome
  | RequestAppInfo
  | RequestCreateCloneCell
  | RequestArchiveCloneCell;

/**
 * Request to call a zome on a conductor's app interface.
 *
 * @public
 */
export interface RequestCallZome {
  type: "zome_call";
  data: CallZomeRequest;
}

/**
 * Request app info from a conductor.
 *
 * @public
 */
export interface RequestAppInfo {
  type: "app_info";
  data: { installed_app_id: string };
}

/**
 * Create a clone cell.
 *
 * @public
 */
export interface RequestCreateCloneCell {
  type: "create_clone_cell";
  data: CreateCloneCellRequest;
}

/**
 * Create a clone cell.
 *
 * @public
 */
export interface RequestArchiveCloneCell {
  type: "archive_clone_cell";
  data: ArchiveCloneCellRequest;
}

/**
 * Restore an archived clone cell.
 *
 * @public
 */
export interface RequestRestoreCloneCell {
  type: "restore_clone_cell";
  data: RestoreCloneCellRequest;
}

/**
 * Delete archived clone cells.
 *
 * @public
 */
export interface RequestDeleteArchivedCloneCells {
  type: "delete_archived_clone_cells";
  data: DeleteArchivedCloneCellsRequest;
}

/**
 * Msgpack encoded request to call an app interface.
 *
 * @public
 */
export interface RequestCallAppInterfaceEncoded
  extends Omit<RequestCallAppInterface, "message"> {
  message: Uint8Array;
}

/**
 * Request a call to the admin interface of a conductor.
 *
 * @public
 */
export interface RequestCallAdminInterface {
  type: "call_admin_interface";
  id: ConductorId;
  message: RequestAdminInterfaceData;
}

/**
 * All possible calls to an admin interface.
 *
 * @public
 */
export interface RequestAdminInterfaceData {
  type:
    | "add_agent_info"
    | "attach_app_interface"
    | "connect_app_interface"
    | "delete_archived_clone_cells"
    | "disable_app"
    | "dump_full_state"
    | "dump_state"
    | "enable_app"
    | "generate_agent_pub_key"
    | "install_app"
    | "install_app_bundle"
    | "list_apps"
    | "list_app_interfaces"
    | "list_cell_ids"
    | "list_dnas"
    | "register_dna"
    | "request_agent_info"
    | "restore_clone_cell"
    | "start_app"
    | "uninstall_app";
  data?:
    | AddAgentInfoRequest
    | AttachAppInterfaceRequest
    | DeleteArchivedCloneCellsRequest
    | DisableAppRequest
    | DumpFullStateRequest
    | DumpStateRequest
    | EnableAppRequest
    | InstallAppRequest
    | InstallAppBundleRequest
    | ListAppsRequest
    | RegisterDnaRequest
    | RequestAgentInfoRequest
    | RestoreCloneCellRequest
    | StartAppRequest
    | UninstallAppRequest;
}

/**
 * @internal
 */
export type _TryCpResponseWrapper =
  | _TryCpResponseWrapperResponse
  | _TryCpResponseWrapperSignal;

/**
 * @internal
 */
export interface _TryCpResponseWrapperResponse {
  type: "response";
  id: number;
  response: _TryCpResponse;
}

/**
 * @internal
 */
export interface _TryCpResponseWrapperSignal {
  type: "signal";
  port: number;
  data: Uint8Array;
}

/**
 * @internal
 */
export interface _TryCpSignal {
  App: [CellId, Uint8Array];
}

/**
 * Responses are composed of an object with either `0` or `1` as a property for success or error.
 *
 * @internal
 */
export type _TryCpResponse = _TryCpResponseSuccess | _TryCpResponseError;

/**
 * @internal
 */
export interface _TryCpResponseSuccess {
  0: _TryCpSuccessResponseSeralized;
}

/**
 * @internal
 */
export interface _TryCpResponseError {
  1: TryCpResponseErrorValue;
}

/**
 * @internal
 */
export type _TryCpSuccessResponseSeralized =
  | typeof TRYCP_SUCCESS_RESPONSE
  | string
  | Uint8Array;

/**
 * Possible values a for success response from the TryCP server.
 *
 * @public
 */
export type TryCpSuccessResponse =
  | typeof TRYCP_SUCCESS_RESPONSE
  | string
  | TryCpApiResponse;

/**
 * Empty success response.
 *
 * @public
 */
export const TRYCP_SUCCESS_RESPONSE = null;

/**
 * Error response values.
 *
 * @public
 */
export type TryCpResponseErrorValue = string | Error;

/**
 * Possible responses from the Admin and App APIs.
 *
 * @public
 */
export type TryCpApiResponse =
  | AdminApiResponse
  | AppApiResponse
  | ApiErrorResponse;

/**
 * Error response from the Admin or App API.
 *
 * @public
 */
export interface ApiErrorResponse {
  type: "error";
  data: { type: string; data: string };
}

/**
 * All possible responses from the Admin API.
 *
 * @public
 */
export type AdminApiResponse =
  | AdminApiResponseAgentInfoAdded
  | AdminApiResponseAgentInfoRequested
  | AdminApiResponseAgentPubKeyGenerated
  | AdminApiResponseAppBundleInstalled
  | AdminApiResponseAppDisabled
  | AdminApiResponseAppEnabled
  | AdminApiResponseAppInstalled
  | AdminApiResponseAppInterfaceAttached
  | AdminApiResponseAppInterfacesListed
  | AdminApiResponseAppStarted
  | AdminApiResponseAppUninstalled
  | AdminApiResponseAppsListed
  | AdminApiResponseArchivedCloneCellsDeleted
  | AdminApiResponseCellIdsListed
  | AdminApiResponseCloneCellRestored
  | AdminApiResponseDnasListed
  | AdminApiResponseDnaRegistered
  | AdminApiResponseStateDumped
  | AdminApiResponseFullStateDumped;

/**
 * @public
 */
export interface AdminApiResponseAgentInfoRequested {
  type: "agent_info_requested";
  data: RequestAgentInfoResponse;
}

/**
 * @public
 */
export interface AdminApiResponseDnaRegistered {
  type: "dna_registered";
  data: HoloHash;
}

/**
 * @public
 */
export interface AdminApiResponseStateDumped {
  type: "state_dumped";
  data: DumpStateResponse;
}

/**
 * @public
 */
export interface AdminApiResponseFullStateDumped {
  type: "full_state_dumped";
  data: FullStateDump;
}

/**
 * @public
 */
export interface AdminApiResponseAgentPubKeyGenerated {
  type: "agent_pub_key_generated";
  data: HoloHash;
}

/**
 * @public
 */
export interface AdminApiResponseAppInstalled {
  type: "app_installed";
  data: InstalledAppInfo;
}

/**
 * @public
 */
export interface AdminApiResponseAppBundleInstalled {
  type: "app_bundle_installed";
  data: InstallAppBundleResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAppEnabled {
  type: "app_enabled";
  data: EnableAppResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAppDisabled {
  type: "app_disabled";
  data: DisableAppResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAppStarted {
  type: "app_started";
  data: StartAppResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAppUninstalled {
  type: "app_uninstalled";
  data: UninstallAppResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAppsListed {
  type: "apps_listed";
  data: ListAppsResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAppInterfacesListed {
  type: "app_interfaces_listed";
  data: ListAppInterfacesResponse;
}

/**
 * @public
 */
export interface AdminApiResponseCellIdsListed {
  type: "cell_ids_listed";
  data: ListCellIdsResponse;
}

/**
 * @public
 */
export interface AdminApiResponseDnasListed {
  type: "dnas_listed";
  data: ListDnasResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAppInterfaceAttached {
  type: "app_interface_attached";
  data: AttachAppInterfaceResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAgentInfoAdded {
  type: "agent_info_added";
}

/**
 * @public
 */
export interface AdminApiResponseAgentInfoRequested {
  type: "agent_info_requested";
  data: AgentInfoSigned[];
}

/**
 * @public
 */
export interface AdminApiResponseCloneCellRestored {
  type: "clone_cell_restored";
  data: RestoreCloneCellResponse;
}

/**
 * @public
 */
export interface AdminApiResponseArchivedCloneCellsDeleted {
  type: "archived_clone_cells_deleted";
  data: DeleteArchivedCloneCellsResponse;
}

/**
 * Possible responses from the App API.
 *
 * @public
 */
export type AppApiResponse =
  | AppApiResponseAppInfo
  | AppApiResponseZomeCall
  | AppApiResponseCreateCloneCell
  | AppApiResponseArchiveCloneCell;

/**
 * @public
 */
export interface AppApiResponseAppInfo {
  type: "app_info";
  data: AppInfoResponse;
}

/**
 * @public
 */
export interface AppApiResponseZomeCall {
  type: "zome_call";
  data: Uint8Array;
}

/**
 * @public
 */
export interface AppApiResponseCreateCloneCell {
  type: "clone_cell_created";
  data: CreateCloneCellResponse;
}

/**
 * @public
 */
export interface AppApiResponseArchiveCloneCell {
  type: "clone_cell_archived";
  data: ArchiveCloneCellResponse;
}
