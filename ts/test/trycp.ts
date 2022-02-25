// import { AdminWebsocket } from "@holochain/client";
import test from "tape";
import {
  TRYCP_SERVER_HOST,
  TRYCP_SERVER_PORT,
  TryCpServer,
} from "../src/trycp/trycp-server";
import { TryCpClient } from "../src/trycp/trycp-client";
import { TryCpServerCall } from "../src/trycp/types";

const createTryCpClient = () =>
  TryCpClient.create(`ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`);

test("TryCP ping", async (assert) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const expected = "peng";
  const actual = (await tryCpClient.ping(expected)).toString();

  await tryCpClient.destroy();
  await localTryCpServer.stop();

  assert.equal(actual, expected);
});

test.only("TryCP call admin interface", async (assert) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  try {
    const expectedId = 1;
    const a = await tryCpClient.call({
      type: "call_admin_interface",
      id: "my-player",
      message: Buffer.from([]),
    });
    console.log("a", a);
    // const actual = await tryCpClient.call({
    //   // @ts-ignore
    //   type: "stop",
    //   id: "my-player",
    // });
    // console.log("actual", actual);
    // const actuale = await tryCpClient.call({
    //   type: TryCpServerCall.StartUp,
    //   id: "my-player",
    // });
    // console.log("actual", actuale);
    // assert.equal(actual.id, expectedId);
  } catch (error) {
    console.error("erere", error);
  }

  await tryCpClient.destroy();
  await localTryCpServer.stop();
  assert.end();
});
