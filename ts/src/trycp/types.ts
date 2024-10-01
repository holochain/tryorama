import {
  AddAgentInfoRequest,
  AgentInfoRequest,
  AgentInfoResponse,
  AppAuthenticationToken,
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
  GetCompatibleCellsRequest,
  GetCompatibleCellsResponse,
  GetDnaDefinitionRequest,
  GrantZomeCallCapabilityRequest,
  HoloHash,
  InstallAppRequest,
  IssueAppAuthenticationTokenRequest,
  IssueAppAuthenticationTokenResponse,
  ListAppInterfacesResponse,
  ListAppsRequest,
  ListAppsResponse,
  ListCellIdsResponse,
  ListDnasResponse,
  NetworkInfoRequest,
  NetworkInfoResponse,
  ProvideMemproofsRequest,
  RegisterDnaRequest,
  RevokeAgentKeyRequest,
  RevokeAgentKeyResponse,
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
  | RequestCallAdminInterface
  | RequestDownloadLogs;

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
  token: AppAuthenticationToken;
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
  Ok = "Ok",
  Err = "Err",
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
  | TryCpControlResponse
  | ApiErrorResponse;

/**
 * A response from the TryCP server.
 *
 * @public
 */
export type TryCpControlResponse = DownloadLogsResponseType;

/**
 * Enumerated response for downloading logs.
 *
 * @public
 */
export interface DownloadLogsResponseType {
  type: "download_logs";
  data: DownloadLogsResponse;
}

/**
 * Response for downloading logs.
 *
 * @public
 */
export interface DownloadLogsResponse {
  lair_stderr: Uint8Array;
  conductor_stdout: Uint8Array;
  conductor_stderr: Uint8Array;
}

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
  | RequestProvideMemproofs
  | RequestEnableApp
  | RequestCreateCloneCell
  | RequestEnableCloneCell
  | RequestDisableCloneCell
  | RequestNetworkInfo;

/**
 * Request to provide deferred memproofs for an app.
 *
 * @public
 */
export interface RequestProvideMemproofs {
  type: "provide_memproofs";
  data: ProvideMemproofsRequest;
}

/**
 * Request to enable the app.
 *
 * @public
 */
export interface RequestEnableApp {
  type: "enable_app";
}

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
 * Request network info.
 *
 * @public
 */
export interface RequestNetworkInfo {
  type: "network_info";
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
  | AppApiResponseMemproofsProvided
  | AppApiResponseZomeCall
  | AppApiResponseCloneCellCreated
  | AppApiResponseCloneCellEnabled
  | AppApiResponseCloneCellDisabled
  | AppApiResponseNetworkInfo;

/**
 * @public
 */
export const AppApiResponseOk = "ok";

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
export interface AppApiResponseMemproofsProvided {
  type: typeof AppApiResponseOk;
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

/**
 * @public
 */
export interface AppApiResponseNetworkInfo {
  type: "network_info";
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
 * Request type for fetching logs from a given conductor.
 *
 * @public
 */
export interface RequestDownloadLogs {
  type: "download_logs";
  id: ConductorId;
}

/**
 * The types of all possible calls to the Admin API.
 *
 * @public
 */
export type RequestAdminInterfaceMessageType =
  | "add_agent_info"
  | "agent_info"
  | "attach_app_interface"
  | "connect_app_interface"
  | "delete_clone_cell"
  | "disable_app"
  | "dump_full_state"
  | "dump_network_stats"
  | "dump_state"
  | "enable_app"
  | "generate_agent_pub_key"
  | "get_compatible_cells"
  | "get_dna_definition"
  | "grant_zome_call_capability"
  | "install_app"
  | "list_apps"
  | "list_app_interfaces"
  | "list_cell_ids"
  | "list_dnas"
  | "register_dna"
  | "revoke_agent_key"
  | "start_app"
  | "storage_info"
  | "uninstall_app"
  | "update_coordinators"
  | "issue_app_authentication_token";

/**
 * All possible calls to the Admin API.
 *
 * @public
 */
export interface RequestAdminInterfaceMessage {
  type: RequestAdminInterfaceMessageType;
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
    | GetCompatibleCellsRequest
    | GetDnaDefinitionRequest
    | GrantZomeCallCapabilityRequest
    | InstallAppRequest
    | ListAppsRequest
    | RegisterDnaRequest
    | RevokeAgentKeyRequest
    | StartAppRequest
    | StorageInfoRequest
    | UninstallAppRequest
    | UpdateCoordinatorsRequest
    | IssueAppAuthenticationTokenRequest;
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
  | AdminApiResponseGetCompatibleCells
  | AdminApiResponseDnasListed
  | AdminApiResponseDnaRegistered
  | AdminApiResponseFullStateDumped
  | AdminApiResponseNetworkStatsDumped
  | AdminApiResponseAgentKeyRevoked
  | AdminApiResponseStateDumped
  | AdminApiResponseStorageInfo
  | AdminApiResponseAppAuthenticationTokenIssued
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
export interface AdminApiResponseGetCompatibleCells {
  type: "compatible_cells";
  data: GetCompatibleCellsResponse;
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
export interface AdminApiResponseNetworkStatsDumped {
  type: "network_stats_dumped";
  data: DumpNetworkStatsResponse;
}

/**
 * @public
 */
export interface AdminApiResponseStorageInfo {
  type: "storage_info";
  data: StorageInfoResponse;
}

/**
 * @public
 */
export interface AdminApiResponseAppAuthenticationTokenIssued {
  type: "app_authentication_token_issued";
  data: IssueAppAuthenticationTokenResponse;
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
export interface AdminApiResponseAgentKeyRevoked {
  type: "agent_key_revoked";
  data: RevokeAgentKeyResponse;
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
export interface AdminApiResponseCoordinatorsUpdated {
  type: "coordinators_updated";
  data: UpdateCoordinatorsResponse;
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
