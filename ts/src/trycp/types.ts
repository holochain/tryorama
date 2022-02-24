export type PlayerId = string;
export interface TryCpServerCall {
  id: number;
  request: TryCpServerRequest;
}

export type TryCpServerRequest =
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

interface RequestDownloadDna {
  type: "download_dna";
  url: string;
}

interface RequestSaveDna {
  type: "save_dna";
  id: string;
  content: Buffer;
}

interface RequestConfigurePlayer {
  type: "configure_player";
  id: PlayerId;
  partial_config: string;
}

interface RequestStartup {
  type: "startup";
  id: PlayerId;
  log_level?: string;
}

interface RequestShutdown {
  type: "shutdown";
  id: PlayerId;
  signal?: "SIGTERM" | "SIGKILL" | "SIGINT";
}

interface RequestReset {
  type: "reset";
}

interface RequestConnectAppInterface {
  type: "connect_app_interface";
  port: number;
}

interface RequestDisconnectAppInterface {
  type: "disconnect_app_interface";
  port: number;
}

interface RequestCallAppInterface {
  type: "call_app_interface";
  port: number;
  message: Buffer;
}

interface RequestCallAdminInterface {
  type: "call_admin_interface";
  id: PlayerId;
  message: Buffer;
}

export interface TryCpResponseWrapper {
  type: "response";
  id: number;
  response: TryCpResponse;
}

export type TryCpResponse = TryCpResponseSuccess & TryCpResponseError;
export type TryCpResponseSuccessValue = null | string;
export type TryCpResponseErrorValue = string;
export const TRYCP_RESPONSE_SUCCESS: TryCpResponseSuccessValue = null;

interface TryCpResponseSuccess {
  0: TryCpResponseSuccessValue;
}

interface TryCpResponseError {
  1: TryCpResponseErrorValue;
}
