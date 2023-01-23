import {
  AddAgentInfoRequest,
  AgentInfoRequest,
  AgentInfoResponse,
  AppInfo,
  AppInfoResponse,
  AttachAppInterfaceRequest,
  AttachAppInterfaceResponse,
  CallZomeRequestSigned,
  CreateCloneCellRequest,
  CreateCloneCellResponse,
  DeleteCloneCellRequest,
  DisableAppRequest,
  DisableAppResponse,
  DisableCloneCellRequest,
  DisableCloneCellResponse,
  DnaDefinition,
  DumpFullStateRequest,
  DumpStateRequest,
  DumpStateResponse,
  EnableAppRequest,
  EnableAppResponse,
  EnableCloneCellRequest,
  EnableCloneCellResponse,
  EncodedAppSignal,
  FullStateDump,
  GetDnaDefinitionRequest,
  GrantZomeCallCapabilityRequest,
  HoloHash,
  InstallAppRequest,
  ListAppInterfacesResponse,
  ListAppsRequest,
  ListAppsResponse,
  ListCellIdsResponse,
  ListDnasResponse,
  RegisterDnaRequest,
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

/* ********************** Request ********************** */

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

/* ********************** Response ********************** */

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
  App: EncodedAppSignal;
}

/* ********************** App API ********************** */

/**
 * Request a call to the App API.
 *
 * @public
 */
export interface RequestCallAppInterface {
  type: "call_app_interface";
  port: number;
  message: RequestCallAppInterfaceMessage;
}

/**
 * All possible calls to the App API.
 *
 * @public
 */
export type RequestCallAppInterfaceMessage =
  | RequestCallZome
  | RequestAppInfo
  | RequestCreateCloneCell
  | RequestEnableCloneCell
  | RequestDisableCloneCell;

/**
 * Request to call a zome on a conductor's app interface.
 *
 * @public
 */
export interface RequestCallZome {
  type: "call_zome";
  data: CallZomeRequestSigned;
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
 * Disable a clone cell.
 *
 * @public
 */
export interface RequestDisableCloneCell {
  type: "disable_clone_cell";
  data: DisableCloneCellRequest;
}

/**
 * Enable a disabled clone cell.
 *
 * @public
 */
export interface RequestEnableCloneCell {
  type: "enable_clone_cell";
  data: EnableCloneCellRequest;
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
 * App API Responses.
 *
 * @public
 */
export type AppApiResponse =
  | AppApiResponseAppInfo
  | AppApiResponseZomeCall
  | AppApiResponseCloneCellCreated
  | AppApiResponseCloneCellEnabled
  | AppApiResponseCloneCellDisabled;

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
export interface AppApiResponseCloneCellCreated {
  type: "clone_cell_created";
  data: CreateCloneCellResponse;
}

/**
 * @public
 */
export interface AppApiResponseCloneCellEnabled {
  type: "clone_cell_enabled";
  data: EnableCloneCellResponse;
}

/**
 * @public
 */
export interface AppApiResponseCloneCellDisabled {
  type: "clone_cell_disabled";
  data: DisableCloneCellResponse;
}

/* ********************** Admin API ********************** */

/**
 * Request a call to the Admin API.
 *
 * @public
 */
export interface RequestCallAdminInterface {
  type: "call_admin_interface";
  id: ConductorId;
  message: RequestAdminInterfaceMessage;
}

/**
 * All possible calls to the Admin API.
 *
 * @public
 */
export interface RequestAdminInterfaceMessage {
  type:
    | "add_agent_info"
    | "agent_info"
    | "attach_app_interface"
    | "connect_app_interface"
    | "delete_clone_cell"
    | "disable_app"
    | "dump_full_state"
    | "dump_state"
    | "enable_app"
    | "generate_agent_pub_key"
    | "get_dna_definition"
    | "grant_zome_call_capability"
    | "install_app"
    | "install_app"
    | "list_apps"
    | "list_app_interfaces"
    | "list_cell_ids"
    | "list_dnas"
    | "register_dna"
    | "start_app"
    | "uninstall_app";
  data?:
    | AddAgentInfoRequest
    | AgentInfoRequest
    | AttachAppInterfaceRequest
    | DeleteCloneCellRequest
    | DisableAppRequest
    | DumpFullStateRequest
    | DumpStateRequest
    | EnableAppRequest
    | GetDnaDefinitionRequest
    | GrantZomeCallCapabilityRequest
    | InstallAppRequest
    | ListAppsRequest
    | RegisterDnaRequest
    | StartAppRequest
    | UninstallAppRequest;
}

/**
 * All possible responses from the Admin API.
 *
 * @public
 */
export type AdminApiResponse =
  | AdminApiResponseAgentInfo
  | AdminApiResponseAgentInfoAdded
  | AdminApiResponseAgentPubKeyGenerated
  | AdminApiResponseAppDisabled
  | AdminApiResponseAppEnabled
  | AdminApiResponseAppInstalled
  | AdminApiResponseAppInterfaceAttached
  | AdminApiResponseAppInterfacesListed
  | AdminApiResponseAppStarted
  | AdminApiResponseAppUninstalled
  | AdminApiResponseAppsListed
  | AdminApiResponseCloneCellDeleted
  | AdminApiResponseCellIdsListed
  | AdminApiResponseDnasDefinitionReturned
  | AdminApiResponseDnasListed
  | AdminApiResponseDnaRegistered
  | AdminApiResponseFullStateDumped
  | AdminApiResponseStateDumped
  | AdminApiResponseZomeCallCapabilityGranted;

/**
 * @public
 */
export interface AdminApiResponseAgentInfo {
  type: "agent_info";
  data: AgentInfoResponse;
}

/**
 * Delete a disabled clone cell.
 *
 * @public
 */
export interface RequestDeleteCloneCell {
  type: "delete_clone_cell";
  data: DeleteCloneCellRequest;
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
export interface AdminApiResponseFullStateDumped {
  type: "full_state_dumped";
  data: FullStateDump;
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
export interface AdminApiResponseZomeCallCapabilityGranted {
  type: "zome_call_capability_granted";
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
  data: AppInfo;
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
export interface AdminApiResponseDnasDefinitionReturned {
  type: "dna_definition_returned";
  data: DnaDefinition;
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
export interface AdminApiResponseCloneCellDeleted {
  type: "clone_cell_deleted";
}
