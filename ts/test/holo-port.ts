import test from "tape";
import msgpack from "@msgpack/msgpack";
import fs from "fs";
import path from "path";
import { TryCpClient } from "../src/trycp/trycp-client";
import { decodeTryCpAdminApiResponse } from "../src/trycp/util";
import {
  DEFAULT_PARTIAL_PLAYER_CONFIG,
  TRYCP_SERVER_HOST,
  TRYCP_SERVER_PORT,
} from "../src/trycp/trycp-server";
import {
  createPlayer,
  RequestAdminInterfaceData,
  TRYCP_RESPONSE_SUCCESS,
} from "../src";
import { HoloHash } from "@holochain/client";

const PORT = 9000;
const HOLO_PORT = `ws://172.26.25.40:${PORT}`;

test("HoloPort ping", async (t) => {
  const tryCpClient = await TryCpClient.create(HOLO_PORT);

  const expected = "peng";
  const actual = (await tryCpClient.ping(expected)).toString();

  await tryCpClient.close();

  t.equal(actual, expected);
});

test("Create and read an entry using the entry zome", async (t) => {
  const player = await createPlayer(HOLO_PORT);
  await player.reset();
  await player.configure();

  const url = path.resolve("ts/test/e2e/fixture/entry.dna");
  const dnaContent = await new Promise<Buffer>((resolve, reject) => {
    fs.readFile(url, null, (err, data) => {
      if (err) {
        reject(err);
      }
      resolve(data);
    });
  });

  const relativePath = await player.saveDna(dnaContent);

  await player.startup();
  const dnaHash = await player.registerDna(relativePath);
  const dnaHashB64 = Buffer.from(dnaHash).toString("base64");
  t.equal(dnaHash.length, 39);
  t.ok(dnaHashB64.startsWith("hC0k"));

  const agentPubKey = await player.generateAgentPubKey();
  const agentPubKeyB64 = Buffer.from(agentPubKey).toString("base64");
  t.equal(agentPubKey.length, 39);
  t.ok(agentPubKeyB64.startsWith("hCAk"));

  const cell_id = await player.installApp(agentPubKey, [
    { hash: dnaHash, role_id: "entry-dna" },
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

  const entryContent = "test-content";
  const createEntryHash = await player.callZome<HoloHash>(port, {
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

  const readEntryResponse = await player.callZome<string>(port, {
    cap_secret: null,
    cell_id,
    zome_name: "crud",
    fn_name: "read",
    provenance: agentPubKey,
    payload: createEntryHash,
  });
  t.equal(readEntryResponse, entryContent);

  await player.shutdown();
  await player.destroy();
});
