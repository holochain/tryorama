import test from "tape-promise/tape";
import { DnaSource, EntryHash } from "@holochain/client";
import { cleanAllConductors, createLocalConductor } from "../../src/local";
import { FIXTURE_DNA_URL } from "../fixture";

test("Local Conductor - spawn a conductor and check for admin and app ws", async (t) => {
  const conductor = await createLocalConductor();
  t.ok(conductor.adminWs());
  t.ok(conductor.appWs());

  await conductor.shutdown();
  await cleanAllConductors();
});

test("Local Conductor - install multiple agents and DNAs and get access to them", async (t) => {
  const conductor = await createLocalConductor();
  const [alice, bob] = await conductor.installAgentsDnas({
    agentsDnas: [
      [{ path: FIXTURE_DNA_URL.pathname }, { path: FIXTURE_DNA_URL.pathname }],
      [{ path: FIXTURE_DNA_URL.pathname }, { path: FIXTURE_DNA_URL.pathname }],
    ],
  });
  alice.cells.forEach((cell) =>
    t.deepEqual(cell.cell_id[1], alice.agentPubKey)
  );
  bob.cells.forEach((cell) => t.deepEqual(cell.cell_id[1], bob.agentPubKey));

  await conductor.shutdown();
  await cleanAllConductors();
});

test("Local Conductor - Create and read an entry using the entry zome", async (t) => {
  const conductor = await createLocalConductor();
  t.ok(conductor.adminWs());
  t.ok(conductor.appWs());

  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const agentPubKeyB64 = Buffer.from(agentPubKey).toString("base64");
  t.equal(agentPubKey.length, 39);
  t.ok(agentPubKeyB64.startsWith("hCAk"));

  const appId = "entry-app";
  const dnaHash = await conductor.registerDna({
    path: FIXTURE_DNA_URL.pathname,
  });
  const installedAppInfo = await conductor.installApp({
    installed_app_id: appId,
    agent_key: agentPubKey,
    dnas: [{ hash: dnaHash, role_id: "entry-dna" }],
  });
  const { cell_id } = installedAppInfo.cell_data[0];
  t.ok(Buffer.from(cell_id[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cell_id[1]).toString("base64").startsWith("hCAk"));

  const enabledAppResponse = await conductor.enableApp({
    installed_app_id: appId,
  });
  t.deepEqual(enabledAppResponse.app.status, { running: null });
  await conductor.attachAppInterface();

  const entryContent = "test-content";
  const createEntryHash = await conductor.callZome<EntryHash>({
    cap_secret: null,
    cell_id,
    zome_name: "crud",
    fn_name: "create",
    provenance: agentPubKey,
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39);
  t.ok(createdEntryHashB64.startsWith("hCkk"));

  const readEntryResponse = await conductor.callZome<typeof entryContent>({
    cap_secret: null,
    cell_id,
    zome_name: "crud",
    fn_name: "read",
    provenance: agentPubKey,
    payload: createEntryHash,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor.shutdown();
  await cleanAllConductors();
});

test("Local Conductor - Create and read an entry using the entry zome, 2 conductors, 2 cells, 2 agents", async (t) => {
  const dnas: DnaSource[] = [{ path: FIXTURE_DNA_URL.pathname }];

  const conductor1 = await createLocalConductor();
  const conductor2 = await createLocalConductor();
  const [alice] = await conductor1.installAgentsDnas({ agentsDnas: [dnas] });
  const [bob] = await conductor2.installAgentsDnas({ agentsDnas: [dnas] });

  const entryContent = "test-content";
  const createEntryHash = await conductor1.callZome<EntryHash>({
    cap_secret: null,
    cell_id: alice.cells[0].cell_id,
    zome_name: "crud",
    fn_name: "create",
    provenance: alice.agentPubKey,
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39);
  t.ok(createdEntryHashB64.startsWith("hCkk"));

  await new Promise((resolve) => setTimeout(resolve, 500));

  const readEntryResponse = await conductor2.callZome<typeof entryContent>({
    cap_secret: null,
    cell_id: bob.cells[0].cell_id,
    zome_name: "crud",
    fn_name: "read",
    provenance: bob.agentPubKey,
    payload: createEntryHash,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor1.shutdown();
  await conductor2.shutdown();
  await cleanAllConductors();
});
