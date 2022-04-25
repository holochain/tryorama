import test from "tape";
import { TryCpClient } from "../src/trycp/trycp-client";
import { DnaSource, HoloHash } from "@holochain/client";
import { createTryCpConductor } from "../src/trycp/conductor";
import { FIXTURE_DNA_URL } from "./fixture";
import { addAllAgentsToAllConductors } from "../src/trycp/util";

const PORT = 9000;
const HOLO_PORT_1 = `ws://172.26.101.242:${PORT}`;
const HOLO_PORT_2 = `ws://172.26.82.149:${PORT}`;
const partialConfig = `signing_service_uri: ~
encryption_service_uri: ~
decryption_service_uri: ~
dpki: ~
network:
  bootstrap_service: https://bootstrap-hc.holo.host/
  transport_pool:
    - type: quic
      bind_to: kitsune-quic://0.0.0.0:0
  network_type: quic_mdns`;

test("HoloPort ping", async (t) => {
  const tryCpClient = await TryCpClient.create(HOLO_PORT_1);

  const expected = "peng";
  const actual = (await tryCpClient.ping(expected)).toString();
  t.equal(actual, expected);

  await tryCpClient.close();
});

test("Create and read an entry using the entry zome", async (t) => {
  const path = FIXTURE_DNA_URL.pathname;
  const dnas: DnaSource[] = [{ path }, { path }];

  const conductor = await createTryCpConductor(HOLO_PORT_1);
  await conductor.reset();
  await conductor.configure(partialConfig);
  await conductor.startup();
  const agentsCells = await conductor.installAgentsDnas(dnas);
  const [alice, bob] = agentsCells;

  const entryContent = "test-content";
  const createEntryHash = await conductor.callZome<HoloHash>({
    cap_secret: null,
    cell_id: alice.cellId,
    zome_name: "crud",
    fn_name: "create",
    provenance: alice.agentPubKey,
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39);
  t.ok(createdEntryHashB64.startsWith("hCkk"));

  const readEntryResponse = await conductor.callZome<string>({
    cap_secret: null,
    cell_id: bob.cellId,
    zome_name: "crud",
    fn_name: "read",
    provenance: bob.agentPubKey,
    payload: createEntryHash,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor.destroy();
});

test.only("Create and read an entry using the entry zome, 2 conductors, 2 cells, 2 agents", async (t) => {
  const dnas: DnaSource[] = [{ path: FIXTURE_DNA_URL.pathname }];

  const conductor1 = await createTryCpConductor(HOLO_PORT_1);
  await conductor1.reset();
  await conductor1.configure(partialConfig);
  await conductor1.startup();
  const [alice] = await conductor1.installAgentsDnas(dnas);

  const conductor2 = await createTryCpConductor(HOLO_PORT_2);
  await conductor2.reset();
  await conductor2.configure(partialConfig);
  await conductor2.startup();
  const [bob] = await conductor2.installAgentsDnas(dnas);

  const entryContent = "test-content";
  const createEntry1Hash = await conductor1.callZome<HoloHash>({
    cap_secret: null,
    cell_id: alice.cellId,
    zome_name: "crud",
    fn_name: "create",
    provenance: alice.agentPubKey,
    payload: entryContent,
  });
  const createdEntry1HashB64 = Buffer.from(createEntry1Hash).toString("base64");
  t.equal(createEntry1Hash.length, 39);
  t.ok(createdEntry1HashB64.startsWith("hCkk"));

  await addAllAgentsToAllConductors([conductor1, conductor2]);
  // await new Promise((resolve) => setTimeout(resolve, 10000));

  const readEntryResponse = await conductor2.callZome<string>({
    cap_secret: null,
    cell_id: bob.cellId,
    zome_name: "crud",
    fn_name: "read",
    provenance: bob.agentPubKey,
    payload: createEntry1Hash,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor1.destroy();
  await conductor2.destroy();
});
