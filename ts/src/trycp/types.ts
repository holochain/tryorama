export type PlayerId = string;
export interface TryCpServerCall {
  id: number;
  request: TryCpServerRequest;
}

export type TryCpServerRequest =
  | RequestDownloadDna
  | RequestConfigurePlayer
  | RequestStartup
  | RequestShutdown
  | RequestReset;

interface RequestDownloadDna {
  type: "download_dna";
  url: string;
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
