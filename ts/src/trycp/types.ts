import {
  AttachAppInterfaceResponse,
  EnableAppResponse,
  HoloHash,
  InstalledAppInfo,
} from "@holochain/client";
import { PlayerId } from "../player/player";

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
  id: PlayerId;
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
  id: PlayerId;
  log_level?: PlayerLogLevel;
}

/**
 * @public
 */
export interface RequestShutdown {
  type: "shutdown";
  id: PlayerId;
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
  message: Uint8Array;
}

/**
 * @param message - Byte code with format RequestAdminInterfaceData
 * @public
 */
export interface RequestCallAdminInterface {
  type: "call_admin_interface";
  id: PlayerId;
  message: Uint8Array;
}

/**
 * @public
 */
export interface RequestAdminInterfaceData {
  type: string;
  data: Record<string, string | number>;
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
 * Value for successful responses from the TryCP server.
 *
 * @public
 */
export type TryCpResponseSuccessValue =
  | TryCpReponseSuccessValueVoid
  | string
  | AdminApiResponse;

/**
 * @public
 */
export type TryCpReponseSuccessValueVoid = null;

/**
 * @public
 */
export const TRYCP_RESPONSE_SUCCESS: TryCpReponseSuccessValueVoid = null;

/**
 * @public
 */
export type TryCpResponseErrorValue = string;

/**
 * @internal
 */
export interface _TryCpResponseSuccess {
  0: TryCpResponseSuccessValue;
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
export interface _TryCpResponseAdminApi {
  type: string;
  data: AdminApiResponse;
}

/**
 * @public
 */
export type AdminApiResponse =
  | HoloHash
  | InstalledAppInfo
  | EnableAppResponse
  | AttachAppInterfaceResponse;

/**
 * @public
 */
export interface _TryCpAppApiResponse {
  type: string;
  data: Uint8Array;
}
