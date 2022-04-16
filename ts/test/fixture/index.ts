import { HoloHash } from "@holochain/client";
import { dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

/**
 * @public
 */
export type ZomeResponsePayload = HoloHash | string;

const path = dirname(fileURLToPath(import.meta.url)) + "/entry.dna";
export const FIXTURE_DNA_URL = pathToFileURL(path);
