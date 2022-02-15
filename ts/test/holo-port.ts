import test from "tape";
import { TryCpClient } from "../src/trycp-client";

const HOLO_PORT = "ws://172.26.25.40:9000";

test("TryCP ping", async (assert) => {
  const tryCpClient = await TryCpClient.create(HOLO_PORT);

  const expected = "peter";
  const actual = (await tryCpClient.ping(expected)).toString();

  await tryCpClient.destroy();

  assert.equal(actual, expected);
});

test("TryCP call admin interface", async (assert) => {
  const tryCpClient = await TryCpClient.create(HOLO_PORT);

  try {
    const actual = await tryCpClient.call({
      type: "call_admin_interface",
      id: "my-player",
      message: { type: "generate_agent_pub_key" },
    });
    assert.equal(actual, "some shi");
  } catch (error) {
    console.error("erere", error);
  }

  await tryCpClient.destroy();
  assert.end();
});
