import { AppSignal, AppSignalCb, EntryHash } from "@holochain/client";
import { URL } from "node:url";
import test from "tape-promise/tape.js";
import { runLocalServices } from "../../src/common.js";
import { TryCpScenario } from "../../src/trycp/conductor/scenario.js";
import {
  TRYCP_SERVER_HOST,
  TRYCP_SERVER_PORT,
  TryCpServer,
  stopAllTryCpServers,
} from "../../src/trycp/trycp-server.js";
import { awaitDhtSync } from "../../src/util.js";
import { FIXTURE_HAPP_URL } from "../fixture/index.js";

const SERVER_URL = new URL(`ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`);

test("TryCP Scenario - create a conductor", async (t) => {
  const tryCpServer = await TryCpServer.start();

  const scenario = new TryCpScenario();
  ({
    servicesProcess: scenario.servicesProcess,
    signalingServerUrl: scenario.signalingServerUrl,
  } = await runLocalServices());
  const client = await scenario.addClient(SERVER_URL);
  t.ok(client, "client set up");

  const conductor = await client.addConductor();
  t.ok(conductor.adminWs() && conductor.appWs(), "conductor set up");

  await scenario.cleanUp();
  await tryCpServer.stop();
});

test("TryCP Scenario - install a hApp to 1 conductor with 1 agent", async (t) => {
  const tryCpServer = await TryCpServer.start();

  const scenario = new TryCpScenario();
  ({
    servicesProcess: scenario.servicesProcess,
    signalingServerUrl: scenario.signalingServerUrl,
  } = await runLocalServices());
  const client = await scenario.addClient(SERVER_URL);
  t.ok(client, "client set up");

  const alice = await scenario.addPlayerWithApp(client, {
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.ok(alice.conductor, "player alice is associated with a conductor");
  t.equal(
    alice.conductor.tryCpClient,
    client,
    "player alice's conductor is associated with the right client"
  );

  await scenario.cleanUp();
  await tryCpServer.stop();
});

test("TryCP Scenario - install a hApp to 2 conductors with 1 agent each", async (t) => {
  const serverPort1 = TRYCP_SERVER_PORT;
  const serverPort2 = TRYCP_SERVER_PORT + 1;
  const serverUrl1 = new URL(`ws://${TRYCP_SERVER_HOST}:${serverPort1}`);
  const serverUrl2 = new URL(`ws://${TRYCP_SERVER_HOST}:${serverPort2}`);
  const tryCpServer1 = await TryCpServer.start(serverPort1);
  const tryCpServer2 = await TryCpServer.start(serverPort2);

  const scenario = new TryCpScenario();
  ({
    servicesProcess: scenario.servicesProcess,
    signalingServerUrl: scenario.signalingServerUrl,
  } = await runLocalServices());
  const client1 = await scenario.addClient(serverUrl1);
  const client2 = await scenario.addClient(serverUrl2);
  t.ok(client1, "client 1 set up");
  t.ok(client2, "client 2 set up");

  const alice = await scenario.addPlayerWithApp(client1, {
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.equal(
    alice.conductor.tryCpClient,
    client1,
    "player alice's conductor is associated with client 1"
  );
  t.ok(
    client1.conductors.find((conductor) => conductor === alice.conductor),
    "client 1 conductors includes alice's conductor"
  );

  const bob = await scenario.addPlayerWithApp(client2, {
    path: FIXTURE_HAPP_URL.pathname,
  });
  t.equal(
    bob.conductor.tryCpClient,
    client2,
    "player bob's conductor is associated with client 2"
  );
  t.ok(
    client2.conductors.find((conductor) => conductor === bob.conductor),
    "client 2 conductors includes bob's conductor"
  );

  await scenario.cleanUp();
  await tryCpServer1.stop();
  await tryCpServer2.stop();
});

test("TryCP Scenario - list everything", async (t) => {
  const tryCpServer = await TryCpServer.start();

  const scenario = new TryCpScenario();
  ({
    servicesProcess: scenario.servicesProcess,
    signalingServerUrl: scenario.signalingServerUrl,
  } = await runLocalServices());
  const client = await scenario.addClient(SERVER_URL);

  const alice = await scenario.addPlayerWithApp(client, {
    path: FIXTURE_HAPP_URL.pathname,
  });

  const listedApps = await alice.conductor.adminWs().listApps({});
  t.ok(listedApps.length === 1, "alice's conductor lists 1 installed app");

  const listedAppInterfaces = await alice.conductor
    .adminWs()
    .listAppInterfaces();
  t.ok(
    listedAppInterfaces.length === 1,
    "alice's conductor lists 1 app interface"
  );

  const listCellIds = await alice.conductor.adminWs().listCellIds();
  t.ok(listCellIds.length === 1, "alice's conductor lists 1 cell id");

  const listedDnas = await alice.conductor.adminWs().listDnas();
  t.ok(listedDnas.length === 1, "alice's conductor lists 1 DNA");

  await scenario.cleanUp();
  await tryCpServer.stop();
});

test("TryCP Scenario - receive signals with 2 conductors", async (t) => {
  const tryCpServer = await TryCpServer.start();

  const scenario = new TryCpScenario();
  ({
    servicesProcess: scenario.servicesProcess,
    signalingServerUrl: scenario.signalingServerUrl,
  } = await runLocalServices());
  const client = await scenario.addClient(SERVER_URL);

  let signalHandlerAlice: AppSignalCb | undefined;
  const signalReceivedAlice = new Promise<AppSignal>((resolve) => {
    signalHandlerAlice = (signal) => {
      resolve(signal);
    };
  });
  let signalHandlerBob: AppSignalCb | undefined;
  const signalReceivedBob = new Promise<AppSignal>((resolve) => {
    signalHandlerBob = (signal) => {
      resolve(signal);
    };
  });
  const [alice, bob] = await scenario.addPlayersWithApps(client, [
    {
      appBundleSource: { path: FIXTURE_HAPP_URL.pathname },
      options: { signalHandler: signalHandlerAlice },
    },
    {
      appBundleSource: { path: FIXTURE_HAPP_URL.pathname },
      options: { signalHandler: signalHandlerBob },
    },
  ]);

  const signalAlice = { value: "hello alice" };
  alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "signal_loopback",
    payload: signalAlice,
  });
  const signalBob = { value: "hello bob" };
  bob.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "signal_loopback",
    payload: signalBob,
  });

  const [actualSignalAlice, actualSignalBob] = await Promise.all([
    signalReceivedAlice,
    signalReceivedBob,
  ]);
  t.deepEqual(
    actualSignalAlice.payload,
    signalAlice,
    "received alice's signal"
  );
  t.deepEqual(actualSignalBob.payload, signalBob, "received bob's signal");

  await scenario.cleanUp();
  await tryCpServer.stop();
});

test("TryCp Scenario - create and read an entry, 2 conductors", async (t) => {
  const tryCpServer = await TryCpServer.start();

  const scenario = new TryCpScenario();
  ({
    servicesProcess: scenario.servicesProcess,
    bootstrapServerUrl: scenario.bootstrapServerUrl,
    signalingServerUrl: scenario.signalingServerUrl,
  } = await runLocalServices());
  const client = await scenario.addClient(SERVER_URL);

  const [alice, bob] = await scenario.addPlayersWithApps(client, [
    { appBundleSource: { path: FIXTURE_HAPP_URL.pathname } },
    { appBundleSource: { path: FIXTURE_HAPP_URL.pathname } },
  ]);

  const content = "Hi dare";
  const createEntryHash = await alice.cells[0].callZome<EntryHash>({
    zome_name: "coordinator",
    fn_name: "create",
    payload: content,
  });

  await scenario.shareAllAgents();
  await scenario.awaitDhtSync(alice.cells[0].cell_id);

  const readContent = await bob.cells[0].callZome<typeof content>({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(readContent, content);

  await scenario.cleanUp();
  await tryCpServer.stop();
});

test("TryCP Scenario - conductor maintains data after shutdown and restart", async (t) => {
  const tryCpServer = await TryCpServer.start();

  const scenario = new TryCpScenario();
  ({
    servicesProcess: scenario.servicesProcess,
    bootstrapServerUrl: scenario.bootstrapServerUrl,
    signalingServerUrl: scenario.signalingServerUrl,
  } = await runLocalServices());
  const client = await scenario.addClient(SERVER_URL);

  const [alice, bob] = await scenario.addPlayersWithApps(client, [
    { appBundleSource: { path: FIXTURE_HAPP_URL.pathname } },
    { appBundleSource: { path: FIXTURE_HAPP_URL.pathname } },
  ]);
  await scenario.shareAllAgents();

  const content = "Before shutdown";
  const createEntryHash = await alice.cells[0].callZome<EntryHash>({
    zome_name: "coordinator",
    fn_name: "create",
    payload: content,
  });
  await scenario.awaitDhtSync(alice.cells[0].cell_id);
  const readContent = await bob.cells[0].callZome<typeof content>({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(
    readContent,
    content,
    "entry content read successfully before shutdown"
  );

  await bob.conductor.shutDown();
  await t.rejects(
    bob.conductor.adminWs().generateAgentPubKey,
    "conductor cannot be reached after shutdown"
  );

  await bob.conductor.startUp({});
  await bob.conductor.connectAppInterface();
  const readContentAfterRestart = await bob.cells[0].callZome<typeof content>({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(
    readContentAfterRestart,
    content,
    "entry content read successfully after restart"
  );

  await scenario.cleanUp();
  await tryCpServer.stop();
});

test("TryCP Scenario - connect to multiple clients by passing a list of URLs", async (t) => {
  const numberOfServers = 2;
  const tryCpServers: TryCpServer[] = [];
  const serverUrls: URL[] = [];

  for (let i = 0; i < numberOfServers; i++) {
    const serverPort = TRYCP_SERVER_PORT + i;
    const serverUrl = new URL(`ws://${TRYCP_SERVER_HOST}:${serverPort}`);
    const tryCpServer = await TryCpServer.start(serverPort);
    tryCpServers.push(tryCpServer);
    serverUrls.push(serverUrl);
  }

  const scenario = new TryCpScenario();
  ({
    servicesProcess: scenario.servicesProcess,
    signalingServerUrl: scenario.signalingServerUrl,
  } = await runLocalServices());
  await scenario.addClientsPlayers(serverUrls, {
    app: { path: FIXTURE_HAPP_URL.pathname },
  });
  t.ok(
    scenario.clients.length === numberOfServers,
    "scenario has expected number of clients"
  );

  for (const [index, client] of scenario.clients.entries()) {
    const PING_MESSAGE = "pingpong";
    const pong = (await client.ping(PING_MESSAGE)).toString();
    t.equal(pong, PING_MESSAGE, `client ${index + 1} is running`);
  }

  await scenario.cleanUp();
  await stopAllTryCpServers(tryCpServers);
});

test.only("TryCP Scenario - create multiple agents for multiple conductors for multiple clients", async (t) => {
  const numberOfServers = 2;
  const numberOfConductorsPerClient = 2;
  const numberOfAgentsPerConductor = 2;
  const tryCpServers: TryCpServer[] = [];
  const serverUrls: URL[] = [];

  for (let i = 0; i < numberOfServers; i++) {
    const serverPort = TRYCP_SERVER_PORT + i;
    const serverUrl = new URL(`ws://${TRYCP_SERVER_HOST}:${serverPort}`);
    const tryCpServer = await TryCpServer.start(serverPort);
    tryCpServers.push(tryCpServer);
    serverUrls.push(serverUrl);
  }

  const scenario = new TryCpScenario();
  ({
    servicesProcess: scenario.servicesProcess,
    bootstrapServerUrl: scenario.bootstrapServerUrl,
    signalingServerUrl: scenario.signalingServerUrl,
  } = await runLocalServices());
  const clientsPlayers = await scenario.addClientsPlayers(serverUrls, {
    numberOfConductorsPerClient,
    numberOfAgentsPerConductor,
    app: { path: FIXTURE_HAPP_URL.pathname },
  });

  clientsPlayers.forEach((clientPlayers, i) =>
    t.equal(
      clientPlayers.players.length,
        numberOfConductorsPerClient * numberOfAgentsPerConductor,
      `client ${i + 1} has expected number of players`
    )
    );

  await scenario.shareAllAgents();

  // Testing if agents that are installed on two different tryCP servers are able to communicate with each other
  const alice = clientsPlayers[0].players[0];
  const bob = clientsPlayers[1].players[0];

  const content = "test-content";
  const createEntryHash = await alice.cells[0].callZome<EntryHash>({
    zome_name: "coordinator",
    fn_name: "create",
    payload: content,
  });
  await awaitDhtSync([alice.conductor, bob.conductor], alice.cells[0].cell_id);
  const readContent = await bob.cells[0].callZome<typeof content>({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(
    readContent,
    content,
    "entry content read successfully across trycp servers"
  );
  await scenario.cleanUp();
  await stopAllTryCpServers(tryCpServers);
});
