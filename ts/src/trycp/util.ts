import msgpack from "@msgpack/msgpack";
import { TryCpResponseWrapper } from "./types";

export const decodeTryCpResponse = (data: ArrayLike<number> | BufferSource) => {
  const decodedData = msgpack.decode(data);
  if (
    decodedData instanceof Object &&
    "id" in decodedData &&
    "type" in decodedData &&
    "response" in decodedData
  ) {
    const tryCpResponse: TryCpResponseWrapper = decodedData;
    return tryCpResponse;
  }
  throw new Error("decode: unknown format");
};
