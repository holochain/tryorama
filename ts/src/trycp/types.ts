import {
  AddAgentInfoRequest,
  AgentInfoSigned,
  AttachAppInterfaceResponse,
  CallZomeRequest,
  CellId,
  EnableAppResponse,
  HoloHash,
  InstallAppRequest,
  InstalledAppInfo,
} from "@holochain/client";
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
export type PlayerLogLevel = "error" | "warn" | "info" | "debug" | "trace";

/**
 * @public
 */
export interface RequestStartup {
  type: "startup";
  id: ConductorId;
  log_level?: PlayerLogLevel;
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
  message: {
    type: "zome_call";
    data: CallZomeRequest;
  };
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
  type: string;
  data?:
    | Record<string, string | number | CellId | null>
    | InstallAppRequest
    | AddAgentInfoRequest;
}

/**
 * @internal
 */
export interface _TryCpResponseWrapper {
  type: "response";
  id: number;
  response: _TryCpResponse;
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
  0: _TryCpResponseSuccessEncoded;
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
export type _TryCpResponseSuccessEncoded =
  | typeof TRYCP_RESPONSE_SUCCESS
  | string
  | Uint8Array;

/**
 * Value for successful responses from the TryCP server.
 *
 * @public
 */
export type TryCpResponseSuccessDecoded =
  | typeof TRYCP_RESPONSE_SUCCESS
  | string
  | _TryCpResponseApi;

/**
 * @public
 */
export const TRYCP_RESPONSE_SUCCESS = null;

/**
 * @public
 */
export type TryCpResponseErrorValue = string;

/**
 * @internal
 */
export interface _TryCpResponseApi {
  type: string;
  data: AdminApiResponse | AppApiResponse;
}

/**
 * @public
 */
export type AdminApiResponse =
  | HoloHash
  | InstalledAppInfo
  | EnableAppResponse
  | AttachAppInterfaceResponse
  | AgentInfoSigned[];

/**
 * @public
 */
export interface AppApiResponse {
  type: "zome_call";
  data: Uint8Array;
}

/**
 * @public
 */
export interface AppApiResponseDecoded extends Omit<AppApiResponse, "data"> {
  data: ZomeResponsePayload;
}

/**
 * @public
 */
export type ZomeResponsePayload = HoloHash | string;
