// import { AdminWebsocket } from "@holochain/client";
import test from "tape-promise/tape";
import {
  TRYCP_SERVER_HOST,
  TRYCP_SERVER_PORT,
  TryCpServer,
  DEFAULT_PARTIAL_PLAYER_CONFIG,
} from "../src/trycp/trycp-server";
import { TryCpClient } from "../src/trycp/trycp-client";
import { TRYCP_RESPONSE_SUCCESS } from "../src/trycp/types";

const createTryCpClient = () =>
  TryCpClient.create(`ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`);

test("TryCP - ping", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const expected = "peng";
  const actual = (await tryCpClient.ping(expected)).toString();

  await tryCpClient.destroy();
  await localTryCpServer.stop();

  t.equal(actual, expected);
});

test("TryCP call - non-existent call throws", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const actual = tryCpClient.call({
    // eslint-disable-next-line
    // @ts-ignore
    type: "non-call",
  });
  // eslint-disable-next-line
  // @ts-ignore
  t.throws(actual);

  await tryCpClient.destroy();
  await localTryCpServer.stop();
});

test("TryCP call - download DNA from web", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const url =
    "https://github.com/holochain/elemental-chat/releases/download/v0.0.1-alpha15/elemental-chat.dna.gz";
  const expectedUrl = url.replace(/https?:\/\/.*?\//g, "").replace(/\//g, "");
  const actualUrl = await tryCpClient.call({
    type: "download_dna",
    url,
  });
  await tryCpClient.destroy();
  await localTryCpServer.stop();

  t.ok(actualUrl?.endsWith(expectedUrl));
});

test("TryCP call - download DNA from file system", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const url =
    "file:///Users/jost/Desktop/holochain/tryorama/ts/test/e2e/fixture/test.dna";
  const expectedUrl = url.replace(/file:/, "").replace(/\//g, "");
  const actualUrl = await tryCpClient.call({
    type: "download_dna",
    url,
  });
  await tryCpClient.destroy();
  await localTryCpServer.stop();

  t.ok(actualUrl?.endsWith(expectedUrl));
});

test("TryCP call - configure player", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const actual = await tryCpClient.call({
    type: "configure_player",
    id: "player-1",
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  await tryCpClient.destroy();
  await localTryCpServer.stop();

  t.equal(actual, TRYCP_RESPONSE_SUCCESS);
});

test("TryCP - 2 parallel calls from one client return corresponding responses", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const parallelCallPromises = [
    tryCpClient.call({
      type: "configure_player",
      id: "player-1",
      partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
    }),
    tryCpClient.call({
      type: "configure_player",
      id: "player-2",
      partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
    }),
  ];
  const [response1, response2] = await Promise.all(parallelCallPromises);
  await tryCpClient.destroy();
  await localTryCpServer.stop();

  t.equal(response1, TRYCP_RESPONSE_SUCCESS);
  t.equal(response2, TRYCP_RESPONSE_SUCCESS);
});

test("TryCP - 2 parallel calls from two clients return correct responses", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient1 = await createTryCpClient();
  const tryCpClient2 = await createTryCpClient();

  const parallelCallPromises = [
    tryCpClient1.call({
      type: "configure_player",
      id: "player-1",
      partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
    }),
    tryCpClient2.call({
      type: "configure_player",
      id: "player-2",
      partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
    }),
  ];
  const [response1, response2] = await Promise.all(parallelCallPromises);
  await tryCpClient1.destroy();
  await tryCpClient2.destroy();
  await localTryCpServer.stop();

  t.equal(response1, TRYCP_RESPONSE_SUCCESS);
  t.equal(response2, TRYCP_RESPONSE_SUCCESS);
});

test("TryCP call - startup", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const playerId = "player-1";
  await tryCpClient.call({
    type: "configure_player",
    id: playerId,
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });

  const actual = await tryCpClient.call({
    type: "startup",
    id: playerId,
  });
  await tryCpClient.destroy();
  await localTryCpServer.stop();

  t.equal(actual, TRYCP_RESPONSE_SUCCESS);
});

test("TryCP call - shutdown", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const playerId = "player-1";
  await tryCpClient.call({
    type: "configure_player",
    id: playerId,
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  await tryCpClient.call({
    type: "startup",
    id: playerId,
  });

  const actual = await tryCpClient.call({
    type: "shutdown",
    id: playerId,
  });

  await tryCpClient.destroy();
  await localTryCpServer.stop();

  t.equal(actual, TRYCP_RESPONSE_SUCCESS);
});

test("TryCP call - reset", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const playerId = "player-1";
  await tryCpClient.call({
    type: "configure_player",
    id: playerId,
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  await tryCpClient.call({
    type: "startup",
    id: playerId,
  });

  const actual = await tryCpClient.call({
    type: "reset",
  });
  const attemptToStartAgain = tryCpClient.call({
    type: "startup",
    id: playerId,
  });
  t.rejects(attemptToStartAgain);

  await tryCpClient.destroy();
  await localTryCpServer.stop();

  t.equal(actual, TRYCP_RESPONSE_SUCCESS);
});
