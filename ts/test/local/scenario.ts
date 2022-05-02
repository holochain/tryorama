import { EntryHash } from "@holochain/client";
import test from "tape-promise/tape";
import { Scenario } from "../../src/local/scenario";
import { pause } from "../../src/util";
import { FIXTURE_DNA_URL } from "../fixture";

test("Local Scenario - Create and read an entry, 2 conductors", async (t) => {
  const scenario = new Scenario();
  t.ok(scenario.uid);

  const alice = await scenario.addPlayer([{ path: FIXTURE_DNA_URL.pathname }]);
  const bob = await scenario.addPlayer([{ path: FIXTURE_DNA_URL.pathname }]);

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

test("Local Scenario - Create and read an entry, 1 conductor", async (t) => {
  const scenario = new Scenario();
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
