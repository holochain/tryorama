import test from "tape-promise/tape";
import { Buffer } from "buffer";
import {
  TRYCP_SERVER_PORT,
  TryCpServer,
  TRYCP_SERVER_HOST,
} from "../src/trycp/trycp-server";
import { TRYCP_RESPONSE_SUCCESS } from "../src/trycp/types";
import { HoloHash } from "@holochain/client";
import { createPlayer } from "../src/player";

test("Create and read an entry using the entry zome", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const player = await createPlayer(
    `ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`
  );

  const url =
    "file:///Users/jost/Desktop/holochain/tryorama/ts/test/e2e/fixture/entry.dna";
  const relativePath = await player.downloadDna(url);

  await player.startup("error");
  const dnaHashB64 = await player.registerDna(relativePath);
  const dnaHash = Buffer.from(dnaHashB64).toString("base64");
  t.equal(dnaHashB64.length, 39);
  t.ok(dnaHash.startsWith("hC0k"));

  const agentPubKeyB64 = await player.generateAgentPubKey();
  const agentPubKey = Buffer.from(agentPubKeyB64).toString("base64");
  t.equal(agentPubKeyB64.length, 39);
  t.ok(agentPubKey.startsWith("hCAk"));

  const cell_id = await player.installApp(agentPubKeyB64, [
    { hash: dnaHashB64, role_id: "entry-dna" },
  ]);
  t.ok(Buffer.from(cell_id[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cell_id[1]).toString("base64").startsWith("hCAk"));

  const enabledAppResponse = await player.enableApp("entry-app");
  t.deepEqual(enabledAppResponse.app.status, { running: null });

  const port = TRYCP_SERVER_PORT + 50;
  const actualPort = await player.attachAppInterface(port);
  t.equal(actualPort, port);

  const connectAppInterfaceResponse = await player.connectAppInterface(port);
  t.equal(connectAppInterfaceResponse, TRYCP_RESPONSE_SUCCESS);

  const createEntryResponse = await player.callZome<HoloHash>(port, {
    cap_secret: null,
    cell_id,
    zome_name: "crud",
    fn_name: "create",
    provenance: agentPubKeyB64,
    payload: { content: "peter" },
  });
  const createdEntryHash = Buffer.from(createEntryResponse).toString("base64");
  t.equal(createEntryResponse.length, 39);
  t.ok(createdEntryHash.startsWith("hCkk"));

  const readEntryResponse = await player.callZome<{
    signed_header: string;
    entry: { Present: { entry: Record<number, number> } };
  }>(port, {
    cap_secret: null,
    cell_id,
    zome_name: "crud",
    fn_name: "read",
    provenance: agentPubKeyB64,
    payload: createEntryResponse,
  });
  console.log(
    "readentryreps",
    JSON.stringify(readEntryResponse.entry.Present.entry, null, 4)
  );
  const s = Object.values(readEntryResponse.entry.Present.entry).map((v) => v);
  console.log("dd", Buffer.from(s).toString());
  t.equal(s, "hello");

  await player.shutdown();
  await localTryCpServer.stop();
});
