import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dnaPath = dirname(fileURLToPath(import.meta.url)) + "/entry.dna";
export const FIXTURE_DNA_URL = pathToFileURL(dnaPath);

const happPath = dirname(fileURLToPath(import.meta.url)) + "/entry.happ";
export const FIXTURE_HAPP_URL = pathToFileURL(happPath);
