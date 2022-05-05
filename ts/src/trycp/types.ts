import {
  AddAgentInfoRequest,
  AgentInfoSigned,
  AppInfoResponse,
  AttachAppInterfaceRequest,
  AttachAppInterfaceResponse,
  CallZomeRequest,
  CellId,
  CreateCloneCellRequest,
  CreateCloneCellResponse,
  DisableAppRequest,
  DisableAppResponse,
  DumpFullStateRequest,
  DumpStateRequest,
  DumpStateResponse,
  EnableAppRequest,
  EnableAppResponse,
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
  StartAppRequest,
  StartAppResponse,
  UninstallAppRequest,
  UninstallAppResponse,
} from "@holochain/client";
import { FullStateDump } from "@holochain/client/lib/api/state-dump";
import { ConductorId } from "./conductor";

/**
 * @internal
 */
export interface _TryCpCall {
  id: number;
  request: TryCpRequest;
}

/**
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
 * @public
 */
export interface RequestSaveDna {
  type: "save_dna";
  id: string;
  content: Buffer;
}

/**
 * @public
 */
export interface RequestConfigurePlayer {
  type: "configure_player";
  id: ConductorId;
  partial_config: string;
}

/**
 * @public
 */
export type TryCpConductorLogLevel =
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "trace";

/**
 * @public
 */
export interface RequestStartup {
  type: "startup";
  id: ConductorId;
  log_level?: TryCpConductorLogLevel;
}

/**
 * @public
 */
export interface RequestShutdown {
  type: "shutdown";
  id: ConductorId;
  signal?: "SIGTERM" | "SIGKILL" | "SIGINT";
}

/**
 * @public
 */
export interface RequestReset {
  type: "reset";
}

/**
 * @public
 */
export interface RequestConnectAppInterface {
  type: "connect_app_interface";
  port: number;
}

/**
 * @public
 */
export interface RequestDisconnectAppInterface {
  type: "disconnect_app_interface";
  port: number;
}

/**
 * @public
 */
export interface RequestCallAppInterface {
  type: "call_app_interface";
  port: number;
  message: RequestCallAppInterfaceMessage;
}

/**
 * @internal
 */
export type RequestCallAppInterfaceMessage = RequestCallZome | RequestAppInfo;

/**
 * @public
 */
export interface RequestCallZome {
  type: "zome_call";
  data: CallZomeRequest;
}

/**
 * @public
 */
export interface RequestAppInfo {
  type: "app_info";
  data: { installed_app_id: string };
}

/**
 * @public
 */
export interface RequestCallAppInterfaceEncoded
  extends Omit<RequestCallAppInterface, "message"> {
  message: Uint8Array;
}

/**
 * @param message - Byte code with format RequestAdminInterfaceData
 * @public
 */
export interface RequestCallAdminInterface {
  type: "call_admin_interface";
  id: ConductorId;
  message: RequestAdminInterfaceData;
}

/**
 * @public
 */
export interface RequestAdminInterfaceData {
  type:
    | "add_agent_info"
    | "attach_app_interface"
    | "connect_app_interface"
    | "create_clone_cell"
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
    | "start_app"
    | "uninstall_app";
  data?:
    | AddAgentInfoRequest
    | AttachAppInterfaceRequest
    | CreateCloneCellRequest
    | DisableAppRequest
    | DumpFullStateRequest
    | DumpStateRequest
    | EnableAppRequest
    | InstallAppRequest
    | InstallAppBundleRequest
    | ListAppsRequest
    | RegisterDnaRequest
    | RequestAgentInfoRequest
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
 * Value for successful responses from the TryCP server.
 *
 * @public
 */
export type TryCpSuccessResponse =
  | typeof TRYCP_SUCCESS_RESPONSE
  | string
  | _TryCpApiResponse;

/**
 * @public
 */
export const TRYCP_SUCCESS_RESPONSE = null;

/**
 * @public
 */
export type TryCpResponseErrorValue = string | Error;

/**
 * @internal
 */
export type _TryCpApiResponse =
  | AdminApiResponse
  | AppApiResponse
  | ApiErrorResponse;

/**
 * @public
 */
export interface ApiErrorResponse {
  type: "error";
  data: { type: string; data: string };
}

/**
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
  | AdminApiResponseCellIdsListed
  | AdminApiResponseCloneCellCreated
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
export interface AdminApiResponseCloneCellCreated {
  type: "clone_cell_created";
  data: CreateCloneCellResponse;
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
export type AppApiResponse = AppApiResponseAppInfo | AppApiResponseZomeCall;

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
