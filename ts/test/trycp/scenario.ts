import { EntryHash } from "@holochain/client";
import test from "tape-promise/tape";
import { URL } from "url";
import { TryCpScenario } from "../../src/trycp/conductor/scenario";
import {
  TRYCP_SERVER_HOST,
  TRYCP_SERVER_PORT,
} from "../../src/trycp/trycp-server";
import { pause } from "../../src/util";
import { FIXTURE_DNA_URL } from "../fixture";

const SERVER_URL = new URL(`ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`);

test("TryCp Scenario - Create and read an entry, 2 conductors", async (t) => {
  const scenario = await TryCpScenario.create(SERVER_URL);
  t.ok(scenario.uid);

  const [alice, bob] = await scenario.addPlayers([
    [{ path: FIXTURE_DNA_URL.pathname }],
    [{ path: FIXTURE_DNA_URL.pathname }],
  ]);

  const content = "Hi dare";
  const createEntryHash = await alice.cells[0].callZome<EntryHash>({
    zome_name: "crud",
    fn_name: "create",
    payload: content,
  });

  await pause(500);

  const readContent = await bob.cells[0].callZome<typeof content>({
    zome_name: "crud",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(readContent, content);

  await scenario.cleanUp();
});

test("TryCP Scenario - Conductor maintains data after shutdown and restart", async (t) => {
  const scenario = await TryCpScenario.create(SERVER_URL);
  const [alice, bob] = await scenario.addPlayers([
    [{ path: FIXTURE_DNA_URL.pathname }],
    [{ path: FIXTURE_DNA_URL.pathname }],
  ]);
  const content = "Before shutdown";
  const createEntryHash = await alice.cells[0].callZome<EntryHash>({
    zome_name: "crud",
    fn_name: "create",
    payload: content,
  });
  await pause(500);
  const readContent = await bob.cells[0].callZome<typeof content>({
    zome_name: "crud",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(readContent, content);

  await bob.conductor.shutDown();
  t.rejects(bob.conductor.generateAgentPubKey);

  await bob.conductor.startUp({});
  await bob.conductor.connectAppInterface();
  const readContentAfterRestart = await bob.cells[0].callZome<typeof content>({
    zome_name: "crud",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(readContentAfterRestart, content);
  await scenario.cleanUp();
});
