import msgpack from "@msgpack/msgpack";
import assert from "assert";
import { ZomeResponsePayload } from "../../test/fixture";
import { Conductor } from "../types";
import { TryCpConductor } from "./conductor";
import { _TryCpApiResponse, _TryCpResponseWrapper } from "./types";

/**
 * Register agents of provided conductors with all other conductors.
 */
export const addAllAgentsToAllConductors = async (conductors: Conductor[]) => {
  await Promise.all(
    conductors.map(
      async (conductorToShareAbout, conductorToShareAboutIndex) => {
        const signedAgentInfos = await conductorToShareAbout.requestAgentInfo({
          cell_id: null,
        });
        await Promise.all(
          conductors.map((conductorToShareWith, conductorToShareWithIndex) => {
            if (conductorToShareWithIndex !== conductorToShareAboutIndex) {
              conductorToShareWith.addAgentInfo({
                agent_infos: signedAgentInfos,
              });
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
  const deserializedPayload = msgpack.decode(payload);
  return deserializedPayload as T;
};

function assertIsResponseWrapper(
  response: unknown
): asserts response is _TryCpResponseWrapper {
  assert(
    response !== null &&
      typeof response === "object" &&
      "id" in response &&
      "type" in response &&
      "response" in response
  );
}

function assertIsApiResponse(
  response: unknown
): asserts response is _TryCpApiResponse {
  assert(response && typeof response === "object" && "type" in response);
}
