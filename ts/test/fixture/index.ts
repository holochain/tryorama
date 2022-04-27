import { HoloHash } from "@holochain/client";
import { dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

/**
 * @public
 */
export type ZomeResponsePayload = HoloHash | string | null;

const dnaPath = dirname(fileURLToPath(import.meta.url)) + "/entry.dna";
export const FIXTURE_DNA_URL = pathToFileURL(dnaPath);

const happPath = dirname(fileURLToPath(import.meta.url)) + "/entry.happ";
export const FIXTURE_HAPP_URL = pathToFileURL(happPath);
