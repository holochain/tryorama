import msgpack from "@msgpack/msgpack";
import {
  TryCpResponseAdminApi,
  TryCpResponseSuccessValue,
  TryCpResponseWrapper,
} from "./types";

export const decodeTryCpResponse = (data: ArrayLike<number> | BufferSource) => {
  const decodedData = msgpack.decode(data);
  assertIsResponseWrapper(decodedData);
  const tryCpResponse = decodedData;
  return tryCpResponse;
};

export const decodeTryCpAdminApiResponse = (
  response: TryCpResponseSuccessValue
) => {
  if (response && typeof response === "object") {
    const decodedResponse = msgpack.decode(response);
    assertIsAdminApiResponse(decodedResponse);
    const decodedAdminApiResponse = decodedResponse;
    return decodedAdminApiResponse;
  }
  throw new TypeError(`decode admin API response: unknown format ${response}`);
};

function assertIsResponseWrapper(
  response: unknown
): asserts response is TryCpResponseWrapper {
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
): asserts decodedResponse is TryCpResponseAdminApi {
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
