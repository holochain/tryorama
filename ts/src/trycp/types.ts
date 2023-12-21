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
  DumpNetworkStatsRequest,
  DumpNetworkStatsResponse,
  DumpStateRequest,
  DumpStateResponse,
  EnableAppRequest,
  EnableAppResponse,
  EnableCloneCellRequest,
  EnableCloneCellResponse,
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
  NetworkInfoRequest,
  NetworkInfoResponse,
  RegisterDnaRequest,
  StartAppRequest,
  StartAppResponse,
  StorageInfoRequest,
  StorageInfoResponse,
  UninstallAppRequest,
  UninstallAppResponse,
  UpdateCoordinatorsRequest,
  UpdateCoordinatorsResponse,
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
 * Responses are composed of an object with either `Ok` or `Err` as a property for success or error.
 *
 * @internal
 */
export type _TryCpResponse = _TryCpResponseSuccess | _TryCpResponseError;

/**
 * @internal
 */
export enum _TryCpResponseResult {
  Ok = "0",
  Err = "1",
}

/**
 * @internal
 */
export interface _TryCpResponseSuccess {
  [_TryCpResponseResult.Ok]: _TryCpSuccessResponseSeralized;
}

/**
 * @internal
 */
export interface _TryCpResponseError {
  [_TryCpResponseResult.Err]: TryCpResponseErrorValue;
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
  type: { "error": null };
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
  | RequestDisableCloneCell
  | RequestNetworkInfo;

/**
 * Request to call a zome on a conductor's app interface.
 *
 * @public
 */
export interface RequestCallZome {
  type: { "call_zome": null };
  data: CallZomeRequestSigned;
}

/**
 * Request app info from a conductor.
 *
 * @public
 */
export interface RequestAppInfo {
  type: { "app_info": null };
  data: { installed_app_id: string };
}

/**
 * Create a clone cell.
 *
 * @public
 */
export interface RequestCreateCloneCell {
  type: { "create_clone_cell": null };
  data: CreateCloneCellRequest;
}

/**
 * Disable a clone cell.
 *
 * @public
 */
export interface RequestDisableCloneCell {
  type: { "disable_clone_cell": null };
  data: DisableCloneCellRequest;
}

/**
 * Enable a disabled clone cell.
 *
 * @public
 */
export interface RequestEnableCloneCell {
  type: { "enable_clone_cell": null };
  data: EnableCloneCellRequest;
}

/**
 * Request network info.
 *
 * @public
 */
export interface RequestNetworkInfo {
  type: { "network_info": null };
  data: NetworkInfoRequest;
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
  | AppApiResponseCloneCellDisabled
  | AppApiResponseNetworkInfo;

/**
 * @public
 */
export interface AppApiResponseAppInfo {
  type: { "app_info": null };
  data: AppInfoResponse;
}

/**
 * @public
 */
export interface AppApiResponseZomeCall {
  type: { "zome_call": null };
  data: Uint8Array;
}

/**
 * @public
 */
export interface AppApiResponseCloneCellCreated {
  type: { "clone_cell_created": null };
  data: CreateCloneCellResponse;
}

/**
 * @public
 */
export interface AppApiResponseCloneCellEnabled {
  type: { "clone_cell_enabled": null };
  data: EnableCloneCellResponse;
}

/**
 * @public
 */
export interface AppApiResponseCloneCellDisabled {
  type: { "clone_cell_disabled": null };
  data: DisableCloneCellResponse;
}

/**
 * @public
 */
export interface AppApiResponseNetworkInfo {
  type: { "network_info": null };
  data: NetworkInfoResponse;
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
 * The types of all possible calls to the Admin API.
 */
interface RequestAdminInterfaceMessageType {
  add_agent_info?: null;
  agent_info?: null;
  attach_app_interface?: null;
  connect_app_interface?: null;
  delete_clone_cell?: null;
  disable_app?: null;
  dump_full_state?: null;
  dump_network_stats?: null;
  dump_state?: null;
  enable_app?: null;
  generate_agent_pub_key?: null;
  get_dna_definition?: null;
  grant_zome_call_capability?: null;
  install_app?: null;
  list_apps?: null;
  list_app_interfaces?: null;
  list_cell_ids?: null;
  list_dnas?: null;
  register_dna?: null;
  start_app?: null;
  storage_info?: null;
  uninstall_app?: null;
  update_coordinators?: null;
}

/**
 * All possible calls to the Admin API.
 *
 * @public
 */
export interface RequestAdminInterfaceMessage {
  type: { [key in keyof RequestAdminInterfaceMessageType]: null };
  data?:
    | AddAgentInfoRequest
    | AgentInfoRequest
    | AttachAppInterfaceRequest
    | DeleteCloneCellRequest
    | DisableAppRequest
    | DumpFullStateRequest
    | DumpNetworkStatsRequest
    | DumpStateRequest
    | EnableAppRequest
    | GetDnaDefinitionRequest
    | GrantZomeCallCapabilityRequest
    | InstallAppRequest
    | ListAppsRequest
    | RegisterDnaRequest
    | StartAppRequest
    | StorageInfoRequest
    | UninstallAppRequest
    | UpdateCoordinatorsRequest;
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
  | AdminApiResponseCellIdsListed
  | AdminApiResponseCloneCellDeleted
  | AdminApiResponseCoordinatorsUpdated
  | AdminApiResponseDnasDefinitionReturned
  | AdminApiResponseDnasListed
  | AdminApiResponseDnaRegistered
  | AdminApiResponseFullStateDumped
  | AdminApiResponseNetworkStatsDumped
  | AdminApiResponseStateDumped
  | AdminApiResponseStorageInfo
  | AdminApiResponseZomeCallCapabilityGranted;

/**
 * @public
 */
export interface AdminApiResponseAgentInfo {
  type: { "agent_info": null };
  data: AgentInfoResponse;
}

/**
 * Delete a disabled clone cell.
 *
 * @public
 */
export interface RequestDeleteCloneCell {
  type: { "delete_clone_cell": null };
  data: DeleteCloneCellRequest;
}

/**
 * @public
 */
export interface AdminApiResponseDnaRegistered {
  type: { "dna_registered": null };
  data: HoloHash;
}

/**
 * @public
 */
export interface AdminApiResponseFullStateDumped {
  type: { "full_state_dumped": null };
  data: FullStateDump;
}

/**
 * @public
 */
export interface AdminApiResponseNetworkStatsDumped {
  type: { "network_stats_dumped": null };
  data: DumpNetworkStatsResponse;
}

/**
 * @public
 */
export interface AdminApiResponseStorageInfo {
  type: { "storage_info": null };
  data: StorageInfoResponse;
}

/**
 * @public
 */
export interface AdminApiResponseStateDumped {
  type: { "state_dumped": null };
  data: DumpStateResponse;
}

/**
 * @public
 */
export interface AdminApiResponseZomeCallCapabilityGranted {
  type: { "zome_call_capability_granted": null };
}

/**
 * @public
 */
export interface AdminApiResponseAgentPubKeyGenerated {
  type: { "agent_pub_key_generated": null };
  data: HoloHash;
}

/**
 * @public
 */
export interface AdminApiResponseAppInstalled {
  type: { "app_installed": null };
  data: AppInfo;
}

/**
 * @public
 */
export interface AdminApiResponseAppEnabled {
  type: { "app_enabled": null };
  data: EnableAppResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAppDisabled {
  type: { "app_disabled": null };
  data: DisableAppResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAppStarted {
  type: { "app_started": null };
  data: StartAppResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAppUninstalled {
  type: { "app_uninstalled": null };
  data: UninstallAppResponse;
}

/**
 * @public
 */
export interface AdminApiResponseCoordinatorsUpdated {
  type: { "coordinators_updated": null };
  data: UpdateCoordinatorsResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAppsListed {
  type: { "apps_listed": null };
  data: ListAppsResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAppInterfacesListed {
  type: { "app_interfaces_listed": null };
  data: ListAppInterfacesResponse;
}

/**
 * @public
 */
export interface AdminApiResponseCellIdsListed {
  type: { "cell_ids_listed": null };
  data: ListCellIdsResponse;
}

/**
 * @public
 */
export interface AdminApiResponseDnasDefinitionReturned {
  type: { "dna_definition_returned": null };
  data: DnaDefinition;
}

/**
 * @public
 */
export interface AdminApiResponseDnasListed {
  type: { "dnas_listed": null };
  data: ListDnasResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAppInterfaceAttached {
  type: { "app_interface_attached": null };
  data: AttachAppInterfaceResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAgentInfoAdded {
  type: { "agent_info_added": null };
}

/**
 * @public
 */
export interface AdminApiResponseCloneCellDeleted {
  type: { "clone_cell_deleted": null };
}
