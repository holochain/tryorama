import test from "tape";
import msgpack from "@msgpack/msgpack";
import fs from "fs";
import path from "path";
import { TryCpClient } from "../src/trycp/trycp-client";
import { decodeTryCpAdminApiResponse } from "../src/trycp/util";
import { DEFAULT_PARTIAL_PLAYER_CONFIG } from "../src/trycp/trycp-server";
import { RequestAdminInterfaceData } from "../src";

const PORT = 9000;
const HOLO_PORT = `ws://172.26.25.40:${PORT}`;

test("HoloPort ping", async (t) => {
  const tryCpClient = await TryCpClient.create(HOLO_PORT);

  const expected = "peng";
  const actual = (await tryCpClient.ping(expected)).toString();

  await tryCpClient.close();

  t.equal(actual, expected);
});

test.only("TryCP call - call admin interface", async (t) => {
  const tryCpClient = await TryCpClient.create(HOLO_PORT);

  await tryCpClient.call({
    type: "reset",
  });

  const url = path.resolve("ts/test/e2e/fixture/entry.dna");
  const dnaContent = await new Promise<Buffer>((resolve, reject) => {
    fs.readFile(url, null, (err, data) => {
      if (err) {
        reject(err);
      }
      resolve(data);
    });
  });

  const relativePath = await tryCpClient.call({
    type: "save_dna",
    id: "./entry.dna",
    content: dnaContent,
  });

  const playerId = "player-1";

  await tryCpClient.call({
    type: "configure_player",
    id: playerId,
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  await tryCpClient.call({
    type: "startup",
    id: playerId,
    log_level: "trace",
  });

  const hashResponse = await tryCpClient.call({
    type: "call_admin_interface",
    id: playerId,
    message: msgpack.encode({
      type: "register_dna",
      data: { path: relativePath },
    }),
  });
  const hashActual = decodeTryCpAdminApiResponse(hashResponse);
  const hash = Buffer.from(hashActual.data).toString("base64");
  console.log("hash", hash);

  t.equal(hashActual.type, "dna_registered");
  t.ok(hash.startsWith("hC0k"));
  t.equal(hash.length, 52);

  const response = await tryCpClient.call({
    type: "call_admin_interface",
    id: playerId,
    message: msgpack.encode({ type: "generate_agent_pub_key" }),
  });
  const actual = decodeTryCpAdminApiResponse(response);
  const actualAgentPubKey = Buffer.from(actual.data).toString("base64");
  console.log("acutal pub key", actualAgentPubKey);

  t.equal(actual.type, "agent_pub_key_generated");
  t.ok(actualAgentPubKey.startsWith("hCAk"));
  t.equal(actualAgentPubKey.length, 52);

  const port = PORT + 50;
  const adminRequestData: RequestAdminInterfaceData = {
    type: "attach_app_interface",
    data: { port },
  };
  await tryCpClient.call({
    type: "call_admin_interface",
    id: playerId,
    message: msgpack.encode(adminRequestData),
  });

  await tryCpClient.call({
    type: "connect_app_interface",
    port,
  });

  // const response2 = await tryCpClient.call({
  //   type: "call_app_interface",
  //   port,
  //   message: msgpack.encode({
  //     type: "app_info",
  //     data: { installed_app_id: "no_happ_installed" },
  //   }),
  // });
  // const actual2 = decodeTryCpAdminApiResponse(response2);
  // console.log("actual2", actual2);

  await tryCpClient.call({
    type: "shutdown",
    id: playerId,
  });

  await tryCpClient.close();
});
