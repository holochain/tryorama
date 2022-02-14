// import { AdminWebsocket } from "@holochain/client";
import test, { Test } from "tape";
import { PORT, startLocalTryCpServer } from "../src/local-trycp-server";
import { TryCpClient } from "../src/trycp-client";

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

test("trycp", async (t) => {
  const localTryCpServer = await startLocalTryCpServer();

  const tryCpClient = await TryCpClient.create("ws://0.0.0.0:" + PORT);
  await tryCpClient.destroy();

  localTryCpServer.on("exit", (code) =>
    console.log("local TryCP server exit code", code)
  );
  localTryCpServer.kill("SIGINT");
});
