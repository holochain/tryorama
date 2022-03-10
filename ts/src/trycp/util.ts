import { CallZomeRequestGeneric, HoloHash } from "@holochain/client";
import msgpack from "@msgpack/msgpack";
import assert from "assert";
import {
  _TryCpResponseAdminApi,
  TryCpResponseSuccessValue,
  _TryCpResponseWrapper,
  _TryCpAppApiResponse,
} from "./types";

export const decodeTryCpResponse = (data: ArrayLike<number> | BufferSource) => {
  const decodedData = msgpack.decode(data);
  assertIsResponseWrapper(decodedData);
  const tryCpResponse = decodedData;
  return tryCpResponse;
};

/**
 * Deserialize the binary response from the Admin API
 *
 * @param response - The response to deserialize.
 * @returns The deserialized response.
 *
 * @internal
 */
export const decodeTryCpAdminApiResponse = (
  response: TryCpResponseSuccessValue
) => {
  if (response && typeof response === "object" && Array.isArray(response)) {
    const decodedResponse = msgpack.decode(response);
    assertIsAdminApiResponse(decodedResponse);
    const decodedAdminApiResponse = decodedResponse;
    return decodedAdminApiResponse;
  }
  throw new TypeError(`decode admin API response: unknown format ${response}`);
};

/**
 * Deserialize the binary response from the App API
 *
 * @param response - The response to deserialize.
 * @returns The deserialized response.
 *
 * @internal
 */
export const decodeAppApiResponse = (response: TryCpResponseSuccessValue) => {
  if (response && typeof response === "object" && Array.isArray(response)) {
    const decodedResponse = msgpack.decode(response);
    assertIsAppApiResponse(decodedResponse);
    const decodedAdminApiResponse = decodedResponse;
    return decodedAdminApiResponse;
  }
  throw new TypeError(`decode app API response: unknown format ${response}`);
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
export const decodeAppApiPayload = <P extends HoloHash>(
  payload: Uint8Array
): P => {
  const decodedPayload = msgpack.decode(payload);
  assertIsApiPayload(decodedPayload);
  return decodedPayload;
};

function assertIsResponseWrapper(
  response: unknown
): asserts response is _TryCpResponseWrapper {
  if (
    response !== null &&
    typeof response === "object" &&
    "id" in response &&
    "type" in response &&
    "response" in response
  ) {
    return;
  }
  throw new TypeError(`decode: unknown format ${response}`);
}

function assertIsAdminApiResponse(
  decodedResponse: unknown
): asserts decodedResponse is _TryCpResponseAdminApi {
  if (
    decodedResponse &&
    typeof decodedResponse === "object" &&
    "type" in decodedResponse &&
    "data" in decodedResponse
  ) {
    return;
  }
  throw new TypeError(`decode: unknown format ${decodedResponse}`);
}

function assertIsAppApiResponse(
  decodedResponse: unknown
): asserts decodedResponse is _TryCpAppApiResponse {
  if (
    decodedResponse &&
    typeof decodedResponse === "object" &&
    "type" in decodedResponse &&
    "data" in decodedResponse
  ) {
    return;
  }
  throw new TypeError(`decode: unknown format ${decodedResponse}`);
}

function assertIsApiPayload(payload: unknown): asserts payload is any {
  assert(typeof payload === "object");
  assert(payload !== null);
  assert("length" in payload);
}
