// import { AdminWebsocket } from "@holochain/client";
import test from "tape";
import msgpack from "@msgpack/msgpack";
import { PORT, TryCpServer } from "../src/trycp/local-trycp-server";
import { TryCpClient } from "../src/trycp/trycp-client";
import { TryCpResponseWrapper } from "../src/trycp/types";
import { decodeTryCpResponse } from "../src/trycp/util";

// async function doTest(url: string) {
//   console.log("starting up at ", url);
//   const ws = new WebSocket(url);
//   await new Promise((resolve) => ws.on("open", resolve));

//   console.log("making ping call");
//   const pongPromise = new Promise((resolve) => ws.on("pong", resolve));
//   await new Promise((resolve) => ws.ping(undefined, undefined, resolve));

//   await pongPromise;
//   console.log("pong!");

//   const responsesAwaited = {};

//   ws.on("message", (message) => {
//     console.log("received message", message);
//     // try {
//     //   const decoded = msgpack.decode(message);
//     //   switch (decoded.type) {
//     //     case "response":
//     //       const { id, response } = decoded;
//     //       responsesAwaited[id](response);
//     //       break;
//     //     case "signal":
//     //       const { port, data } = decoded;
//     //       break;
//     //     default:
//     //       throw new Error("unexpected message from trycp");
//     //   }
//     // } catch (e) {
//     //   console.error("Error processing message", message, e);
//     // }
//   });

//   let nextId = 0;

// const call = async (request) => {
//   const payload = msgpack.encode({
//     id,
//     request,
//   });
// };

// const responsePromise = new Promise(
//   (resolve) => (responsesAwaited[id] = resolve)
// );

// await new Promise((resolve) => ws.send(payload, {}, resolve));

// return await responsePromise;
//   };
// }

test("Local TryCP ping", async (assert) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await TryCpClient.create("ws://0.0.0.0:" + PORT);

  const expected = "peng";
  const actual = (await tryCpClient.ping(expected)).toString();

  await tryCpClient.destroy();
  await localTryCpServer.stop();

  assert.equal(actual, expected);
});

test.only("TryCP call admin interface", async (assert) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await TryCpClient.create("ws://0.0.0.0:" + PORT);

  try {
    const expectedId = 1;
    const actual = await tryCpClient.call({
      type: "call_admin_interface",
      id: "my-player",
      message: { type: "generate_agent_pub_key" },
    });
    assert.equal(actual.id, expectedId);
  } catch (error) {
    console.error("erere", error);
  }

  await tryCpClient.destroy();
  await localTryCpServer.stop();
  assert.end();
});
