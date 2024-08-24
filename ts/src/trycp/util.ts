import { Signal, SignalType } from "@holochain/client";
import msgpack from "@msgpack/msgpack";
import assert from "node:assert";
import { TryCpApiResponse, _TryCpResponseWrapper } from "./types.js";

/**
 * Deserialize the binary response from TryCP
 *
 * @param response - The response to deserialize.
 * @returns The deserialized response.
 *
 * @internal
 */
export const deserializeTryCpResponse = (response: Uint8Array) => {
  const decodedData = msgpack.decode(response);
  assertIsResponseWrapper(decodedData);
  return decodedData;
};

/**
 * Deserialize a binary signal from TryCP
 *
 * @param signal - The signal to deserialize.
 * @returns The deserialized signal.
 */
export const deserializeTryCpSignal = (signal: Uint8Array) => {
  const deserializedSignal = msgpack.decode(signal);
  assertIsSignal(deserializedSignal);
  if (SignalType.App in deserializedSignal) {
    const {
      [SignalType.App]: { cell_id, payload: decodedPayload, zome_name },
    } = deserializedSignal;
    const app_payload = { cell_id, payload: decodedPayload, zome_name };
    return { App: app_payload } as Signal;
  } else {
    throw new Error("Receiving system signals is not implemented yet");
  }
};

/**
 * Deserialize the binary response from the Admin or App API
 *
 * @param response - The response to deserialize.
 * @returns The deserialized response.
 *
 * @internal
 */
export const deserializeApiResponse = (response: Uint8Array) => {
  const decodedResponse = msgpack.decode(response);
  assertIsApiResponse(decodedResponse);
  return decodedResponse;
};

/**
 * Deserialize the App API response's payload
 *
 * @param payload - The payload to deserialize.
 * @typeParam P - The type of the response's payload.
 * @returns The deserialized payload.
 *
 * @internal
 */
export const deserializeZomeResponsePayload = <T>(payload: Uint8Array): T => {
  const deserializedPayload = msgpack.decode(payload);
  return deserializedPayload as T;
};

function assertIsResponseWrapper(
  response: unknown
): asserts response is _TryCpResponseWrapper {
  assert(
    response !== null &&
      typeof response === "object" &&
      "type" in response &&
      // responses contain "id" and "response"
      (("id" in response && "response" in response) ||
        //and signals contain "port" and "data"
        ("port" in response && "data" in response))
  );
}

function assertIsApiResponse(
  response: unknown
): asserts response is TryCpApiResponse {
  assert(response && typeof response === "object" && "type" in response);
}

function assertIsSignal(signal: unknown): asserts signal is Signal {
  assert(
    signal &&
      typeof signal === "object" &&
      (SignalType.App in signal || SignalType.System in signal)
  );
}
