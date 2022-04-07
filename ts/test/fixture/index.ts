import { dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const path = dirname(fileURLToPath(import.meta.url)) + "/entry.dna";
export const FIXTURE_DNA_URL = pathToFileURL(path);
