import { Buffer } from "node:buffer";
import test from "tape-promise/tape.js";
import { URL } from "node:url";
import {
  cleanAllTryCpConductors,
  createTryCpConductor,
  DEFAULT_PARTIAL_PLAYER_CONFIG,
} from "../../src/trycp/index.js";
import { TryCpClient } from "../../src/trycp/trycp-client.js";
import {
  TryCpServer,
  TRYCP_SERVER_HOST,
  TRYCP_SERVER_PORT,
} from "../../src/trycp/trycp-server.js";
import { TRYCP_SUCCESS_RESPONSE } from "../../src/trycp/types.js";
import { FIXTURE_DNA_URL } from "../fixture/index.js";

const SERVER_URL = new URL(`ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`);
const createTryCpClient = () => TryCpClient.create(SERVER_URL);

test("TryCP Server - Ping", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const expected = "peng";
  const actual = (await tryCpClient.ping(expected)).toString();
  t.equal(actual, expected);

  await tryCpClient.close();
  await localTryCpServer.stop();
});

test("TryCP Server - Non-existent call throws", async (t) => {
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

  await tryCpClient.close();
  await localTryCpServer.stop();
});

test("TryCP Server - Download DNA from web", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const url =
    "https://github.com/holochain/elemental-chat/releases/download/v0.0.1-alpha15/elemental-chat.dna.gz";
  const expectedUrl = url.replace(/https?:\/\/.*?\//g, "").replace(/\//g, "");
  const actualUrl = await tryCpClient.call({
    type: "download_dna",
    url,
  });
  t.ok(typeof actualUrl === "string" && actualUrl.endsWith(expectedUrl));

  await tryCpClient.close();
  await localTryCpServer.stop();
});

test("TryCP Server - Download DNA from file system", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const url = FIXTURE_DNA_URL.href;
  const expectedUrl = url.replace(/file:/, "").replace(/\//g, "");
  const actualUrl = await tryCpClient.call({
    type: "download_dna",
    url,
  });
  t.ok(typeof actualUrl === "string" && actualUrl.endsWith(expectedUrl));

  await tryCpClient.close();
  await localTryCpServer.stop();
});

test("TryCP Server - Save DNA to file system", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const dnaId = "dna-1";
  const actualUrl = await tryCpClient.call({
    type: "save_dna",
    id: dnaId,
    content: Buffer.from([0, 1, 2, 3, 4]),
  });
  t.ok(typeof actualUrl === "string" && actualUrl.endsWith(dnaId));

  await tryCpClient.close();
  await localTryCpServer.stop();
});

test("TryCP Server - Configure player", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const actual = await tryCpClient.call({
    type: "configure_player",
    id: "player-1",
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  t.equal(actual, TRYCP_SUCCESS_RESPONSE);

  await tryCpClient.close();
  await localTryCpServer.stop();
});

test("TryCP Server - 2 parallel calls from one client return corresponding responses", async (t) => {
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
  t.equal(response1, TRYCP_SUCCESS_RESPONSE);
  t.equal(response2, TRYCP_SUCCESS_RESPONSE);

  await tryCpClient.close();
  await localTryCpServer.stop();
});

test("TryCP Server - 2 parallel calls from two clients return correct responses", async (t) => {
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
  t.equal(response1, TRYCP_SUCCESS_RESPONSE);
  t.equal(response2, TRYCP_SUCCESS_RESPONSE);

  await tryCpClient1.close();
  await tryCpClient2.close();
  await localTryCpServer.stop();
});

test("TryCP Server - Startup and shutdown", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();

  const playerId = "player-1";
  await tryCpClient.call({
    type: "configure_player",
    id: playerId,
    partial_config: DEFAULT_PARTIAL_PLAYER_CONFIG,
  });
  const actualStartup = await tryCpClient.call({
    type: "startup",
    id: playerId,
  });
  t.equal(actualStartup, TRYCP_SUCCESS_RESPONSE);

  const actualShutdown = await tryCpClient.call({
    type: "shutdown",
    id: playerId,
  });
  t.equal(actualShutdown, TRYCP_SUCCESS_RESPONSE);

  await tryCpClient.close();
  await localTryCpServer.stop();
});

test("TryCP Server - Reset", async (t) => {
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
  t.equal(actual, TRYCP_SUCCESS_RESPONSE);
  const attemptToStartAgain = tryCpClient.call({
    type: "startup",
    id: playerId,
  });
  await t.rejects(attemptToStartAgain);

  await tryCpClient.close();
  await localTryCpServer.stop();
});

test("TryCP Server - Clean all conductors", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const actual = await cleanAllTryCpConductors(SERVER_URL);
  t.equal(actual, TRYCP_SUCCESS_RESPONSE);
  await localTryCpServer.stop();
});

test("TryCP Server - Admin API - Connect app interface", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const conductor = await createTryCpConductor(SERVER_URL);

  const { port } = await conductor.adminWs().attachAppInterface();
  t.ok(typeof port === "number");

  const connectAppInterfaceResponse = await conductor.connectAppInterface();
  t.equal(connectAppInterfaceResponse, TRYCP_SUCCESS_RESPONSE);

  const appInfoResponse = await conductor
    .appWs()
    .appInfo({ installed_app_id: "" });
  t.equal(appInfoResponse, null);

  const disconnectAppInterfaceResponse =
    await conductor.disconnectAppInterface();
  t.equal(disconnectAppInterfaceResponse, TRYCP_SUCCESS_RESPONSE);

  await conductor.shutDown();
  await conductor.disconnectClient();
  await localTryCpServer.stop();
});

test("TryCP Server - App API - Get app info", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const conductor = await createTryCpConductor(SERVER_URL);
  const [alice] = await conductor.installAgentsHapps({
    agentsDnas: [[{ path: FIXTURE_DNA_URL.pathname }]],
  });
  await conductor.adminWs().attachAppInterface();
  await conductor.connectAppInterface();

  const appInfo = await conductor
    .appWs()
    .appInfo({ installed_app_id: alice.happId });
  t.deepEqual(appInfo.status, { running: null });

  await conductor.disconnectAppInterface();
  await conductor.shutDown();
  await conductor.disconnectClient();
  await localTryCpServer.stop();
});
