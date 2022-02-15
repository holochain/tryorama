// import { AdminWebsocket } from "@holochain/client";
import test from "tape";
import { PORT, TryCpServer } from "../src/trycp/trycp-server";
import { TryCpClient } from "../src/trycp/trycp-client";
import { decodeTryCpResponse } from "../src/trycp/util";

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
