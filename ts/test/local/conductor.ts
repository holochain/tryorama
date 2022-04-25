import test from "tape-promise/tape";
import { cleanSandboxes, createLocalConductor } from "../../src/local";

test.only("Local - spawn a local conductor", async (t) => {
  const conductor = await createLocalConductor();
  await conductor.start();
  await conductor.adminWs().listApps({});
  await conductor.appWs().appInfo({ installed_app_id: "" });

  await conductor.destroy();
  await cleanSandboxes();
});

test("Local - Create and read an entry using the entry zome", async (t) => {
  // const adminPort = await conductor.start();
  // const client = await createClient(`ws://127.0.0.1:${adminPort}`);
  // t.ok(client.adminWs);
  // await client.adminWs.listApps({});
  // t.ok(client.appWs);
  // await client.appWs.appInfo({ installed_app_id: "" });
  // const agentPubKey = await conductor.generateAgentPubKey();
  // const agentPubKeyB64 = Buffer.from(agentPubKey).toString("base64");
  // t.equal(agentPubKey.length, 39);
  // t.ok(agentPubKeyB64.startsWith("hCAk"));
  // const appId = "entry-app";
  // const installedAppInfo = await conductor.installApp({
  //   installed_app_id: appId,
  //   agent_key: agentPubKey,
  //   dnas: [{ hash: dnaHash, role_id: "entry-dna" }],
  // });
  // const { cell_id } = installedAppInfo.cell_data[0];
  // t.ok(Buffer.from(cell_id[0]).toString("base64").startsWith("hC0k"));
  // t.ok(Buffer.from(cell_id[1]).toString("base64").startsWith("hCAk"));
  // const enabledAppResponse = await conductor.enableApp(appId);
  // t.deepEqual(enabledAppResponse.app.status, { running: null });
  // await conductor.attachAppInterface();
  // const connectAppInterfaceResponse = await conductor.connectAppInterface();
  // t.equal(connectAppInterfaceResponse, TRYCP_SUCCESS_RESPONSE);
  // const entryContent = "test-content";
  // const createEntryHash = await conductor.callZome<HoloHash>({
  //   cap_secret: null,
  //   cell_id,
  //   zome_name: "crud",
  //   fn_name: "create",
  //   provenance: agentPubKey,
  //   payload: entryContent,
  // });
  // const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  // t.equal(createEntryHash.length, 39);
  // t.ok(createdEntryHashB64.startsWith("hCkk"));
  // const readEntryResponse = await conductor.callZome<string>({
  //   cap_secret: null,
  //   cell_id,
  //   zome_name: "crud",
  //   fn_name: "read",
  //   provenance: agentPubKey,
  //   payload: createEntryHash,
  // });
  // t.equal(readEntryResponse, entryContent);
  // await client.destroy();
  // await conductor.destroy();
  // await cleanSandboxes();
});
