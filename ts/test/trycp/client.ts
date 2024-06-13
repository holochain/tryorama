import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import test from "tape-promise/tape.js";
import { _ALLOWED_ORIGIN, enableAndGetAgentApp } from "../../src/common.js";
import {
  DEFAULT_PARTIAL_PLAYER_CONFIG,
  createTryCpConductor,
} from "../../src/trycp/index.js";
import { TryCpClient } from "../../src/trycp/trycp-client.js";
import {
  TRYCP_SERVER_HOST,
  TRYCP_SERVER_PORT,
  TryCpServer,
} from "../../src/trycp/trycp-server.js";
import { TRYCP_SUCCESS_RESPONSE } from "../../src/trycp/types.js";
import { FIXTURE_DNA_URL, FIXTURE_HAPP_URL } from "../fixture/index.js";

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

test("TryCP Server - non-existent call throws", async (t) => {
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

test("TryCP Server - download DNA from web", async (t) => {
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

test("TryCP Server - download DNA from file system", async (t) => {
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

test("TryCP Server - save DNA to file system", async (t) => {
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

test("TryCP Server - configure player", async (t) => {
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

test("TryCP Server - startup and shutdown", async (t) => {
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

test("TryCP Server - reset", async (t) => {
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

test("TryCP Server - clean all conductors", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();
  const actual = await tryCpClient.cleanAllConductors();
  t.equal(actual, TRYCP_SUCCESS_RESPONSE);
  await tryCpClient.close();
  await localTryCpServer.stop();
});

test("TryCP Client - shut down", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const client = await createTryCpClient();
  const conductor1 = await client.addConductor();
  const conductor2 = await client.addConductor();
  t.doesNotReject(
    conductor1.adminWs().generateAgentPubKey,
    "conductor 1 responds"
  );
  t.doesNotReject(
    conductor2.adminWs().generateAgentPubKey,
    "conductor 2 responds"
  );
  await client.shutDownConductors();
  t.rejects(conductor1.adminWs().generateAgentPubKey, "conductor 1 is down");
  t.rejects(conductor2.adminWs().generateAgentPubKey, "conductor 2 is down");

  await client.cleanUp();
  await localTryCpServer.stop();
});

test("TryCP Server - Admin API - connect app interface", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();
  const conductor = await createTryCpConductor(tryCpClient);
  const app = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });

  const { port } = await conductor
    .adminWs()
    .attachAppInterface({ allowed_origins: _ALLOWED_ORIGIN });
  t.ok(typeof port === "number");

  const issued = await conductor
    .adminWs()
    .issueAppAuthenticationToken({ installed_app_id: app.installed_app_id });
  const connectAppInterfaceResponse = await conductor.connectAppInterface(
    issued.token,
    port
  );
  t.equal(connectAppInterfaceResponse, TRYCP_SUCCESS_RESPONSE);

  const appWs = await conductor.connectAppWs(issued.token, port);
  t.equal(typeof appWs.appInfo, "function");

  const appInfoResponse = await appWs.appInfo();
  t.ok(appInfoResponse);
  t.equal(appInfoResponse?.installed_app_id, app.installed_app_id);

  const disconnectAppInterfaceResponse = await conductor.disconnectAppInterface(
    port
  );
  t.equal(disconnectAppInterfaceResponse, TRYCP_SUCCESS_RESPONSE);

  await conductor.shutDown();
  await conductor.disconnectClient();
  await localTryCpServer.stop();
});

test("TryCP Server - App API - get app info", async (t) => {
  const localTryCpServer = await TryCpServer.start();
  const tryCpClient = await createTryCpClient();
  const conductor = await createTryCpConductor(tryCpClient);
  const aliceApp = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  const adminWs = conductor.adminWs();
  const { port } = await adminWs.attachAppInterface({
    allowed_origins: _ALLOWED_ORIGIN,
  });
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: aliceApp.installed_app_id,
  });
  await conductor.connectAppInterface(issued.token, port);
  const appWs = await conductor.connectAppWs(issued.token, port);
  await enableAndGetAgentApp(adminWs, appWs, aliceApp);

  const appInfo = await appWs.appInfo();
  assert(appInfo);
  t.deepEqual(appInfo.status, "running");

  await conductor.disconnectAppInterface(port);
  await conductor.shutDown();
  await conductor.disconnectClient();
  await localTryCpServer.stop();
});
