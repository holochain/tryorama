import msgpack from "@msgpack/msgpack";
import { TryCpConductor } from "./conductor";
import {
  _TryCpResponseApi,
  _TryCpResponseWrapper,
  ZomeResponsePayload,
} from "./types";

/**
 * Register agents of provided conductors with all other conductors.
 */
export const addAllAgentsToAllConductors = async (
  conductors: TryCpConductor[]
) => {
  await Promise.all(
    conductors.map(
      async (conductorToShareAbout, conductorToShareAboutIndex) => {
        const signedAgentInfos = await conductorToShareAbout.requestAgentInfo();
        await Promise.all(
          conductors.map((conductorToShareWith, conductorToShareWithIndex) => {
            if (conductorToShareWithIndex !== conductorToShareAboutIndex) {
              conductorToShareWith.addAgentInfo(signedAgentInfos);
            }
          })
        );
      }
    )
  );
};

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
  const tryCpResponse = decodedData;
  return tryCpResponse;
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
  const decodedAdminApiResponse = decodedResponse;
  return decodedAdminApiResponse;
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
export const deserializeZomeResponsePayload = <T extends ZomeResponsePayload>(
  payload: Uint8Array
): T => {
  const deserializedPayload = msgpack.decode(payload) as T;
  return deserializedPayload;
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

function assertIsApiResponse(
  decodedResponse: unknown
): asserts decodedResponse is _TryCpResponseApi {
  if (
    decodedResponse &&
    typeof decodedResponse === "object" &&
    "type" in decodedResponse
  ) {
    return;
  }
  throw new TypeError(`decode: unknown format ${decodedResponse}`);
}
