import msgpack from "@msgpack/msgpack";
import test from "tape-promise/tape";
import assert from "assert";
import { Buffer } from "buffer";
import {
  TRYCP_SERVER_PORT,
  TryCpServer,
  TRYCP_SERVER_HOST,
} from "../src/trycp/trycp-server";
import { RequestAdminInterfaceData } from "../src/trycp/types";
import {
  decodeAppApiResponse,
  decodeTryCpAdminApiResponse,
} from "../src/trycp/util";
import { CallZomeResponse } from "@holochain/client";
import { createPlayer } from "../src/player/player";

test("Create and read an entry using the entry zome", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const player = await createPlayer(
    `ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`
  );

  const url =
    "file:///Users/jost/Desktop/holochain/tryorama/ts/test/e2e/fixture/entry.dna";
  const relativePath = await player.downloadDna(url);

  await player.startup("trace");
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

  // const createEntryResponse = await tryCpClient.call({
  //   type: "call_app_interface",
  //   port,
  //   message: msgpack.encode({
  //     type: "zome_call",
  //     data: {
  //       cap: null,
  //       cell_id,
  //       zome_name: "crud",
  //       fn_name: "create",
  //       provenance: decodedGenerateAgentPubKeyResponse.data,
  //       payload: msgpack.encode({ content: "hello" }),
  //     },
  //   }),
  // });
  // const decodedCreateEntryResponse = decodeAppApiResponse(
  //   createEntryResponse
  // ) as CallZomeResponse;
  // const decodedPayload = msgpack.decode(
  //   decodedCreateEntryResponse.data
  // ) as Uint8Array;
  // const entryHash = Buffer.from(decodedPayload).toString("base64");

  // t.equal(decodedPayload.length, 39);
  // t.ok(entryHash.startsWith("hCkk"));

  await player.shutdown();
  await localTryCpServer.stop();
});
