export { TryCpServer } from "./trycp-server";
export { TryCpClient } from "./trycp-client";
export * from "./types";
export * from "./conductor";

import assert from "assert";
import { createConductor } from "./conductor";
import { TRYCP_SERVER_HOST, TRYCP_SERVER_PORT } from "./trycp-server";
import { PlayerLogLevel, TRYCP_SUCCESS_RESPONSE } from "./types";

/**
 * Helper to install DNAs and create agents. Given an array of DNAs, a conductor
 * is spawned, DNAs are installed, an agent is created and handles to the
 * conductor, the cells and the agents are returned.
 *
 * @param dnaUrl - The URL of the DNA to install.
 * @param options - Options to set log level and other parameters.
 * @returns Handles to the conductor instance and the created cells.
 *
 * @public
 */
export async function installAgentsHapps(
  dnaUrl: URL,
  options?: { logLevel: PlayerLogLevel }
) {
  const conductor = await createConductor(
    `ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`
  );
  await conductor.configure();
  const relativePath = await conductor.downloadDna(dnaUrl);
  await conductor.startup(options?.logLevel);
  const dnaHash = await conductor.registerDna(relativePath);
  const agentPubKey = await conductor.generateAgentPubKey();
  const installedAppInfo = await conductor.installApp({
    installed_app_id: "entry-app",
    agent_key: agentPubKey,
    dnas: [{ hash: dnaHash, role_id: "entry-dna" }],
  });
  const enabledAppResponse = await conductor.enableApp("entry-app");
  assert(
    "running" in enabledAppResponse.app.status &&
      enabledAppResponse.app.status.running === null
  );
  await conductor.attachAppInterface();
  const connectAppInterfaceResponse = await conductor.connectAppInterface();
  assert(connectAppInterfaceResponse === TRYCP_SUCCESS_RESPONSE);
  return { conductor, cells: installedAppInfo.cell_data };
}
