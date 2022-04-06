export { TryCpServer } from "./trycp-server";
export { TryCpClient } from "./trycp-client";
export * from "./types";

import assert from "assert";
import { createConductor } from "./conductor";
import { TRYCP_SERVER_HOST, TRYCP_SERVER_PORT } from "./trycp-server";
import { PlayerLogLevel, TRYCP_RESPONSE_SUCCESS } from "./types";

export async function installAgentsHapps(
  dnaUrl: string,
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
  const cellId = await conductor.installApp(agentPubKey, [
    { hash: dnaHash, role_id: "entry-dna" },
  ]);
  const enabledAppResponse = await conductor.enableApp("entry-app");
  assert(
    "running" in enabledAppResponse.app.status &&
      enabledAppResponse.app.status.running === null
  );
  const port = TRYCP_SERVER_PORT + 50;
  await conductor.attachAppInterface(port);
  const connectAppInterfaceResponse = await conductor.connectAppInterface(port);
  assert(connectAppInterfaceResponse === TRYCP_RESPONSE_SUCCESS);
  return { conductor, cellId };
}
