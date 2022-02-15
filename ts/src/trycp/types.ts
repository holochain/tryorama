export interface TryCpCallPayload {
  type: string;
  id: string;
  message: { type: string };
}

export interface TryCpRequestWrapper {
  id: number;
  request: {
    id: string;
    message: Buffer;
  };
}

export interface TryCpResponseWrapper {
  type: string;
  id: number;
  response: { 0: null };
}
