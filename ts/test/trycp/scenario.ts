import { AppSignal, AppSignalCb, EntryHash } from "@holochain/client";
import test from "tape-promise/tape.js";
import { URL } from "node:url";
import { Dna } from "../../src/types.js";
import { TryCpScenario } from "../../src/trycp/conductor/scenario.js";
import {
  TryCpServer,
  TRYCP_SERVER_HOST,
  TRYCP_SERVER_PORT,
} from "../../src/trycp/trycp-server.js";
import { pause } from "../../src/util.js";
import { FIXTURE_DNA_URL } from "../fixture/index.js";

const SERVER_URL = new URL(`ws://${TRYCP_SERVER_HOST}:${TRYCP_SERVER_PORT}`);

test("TryCP Scenario - create a conductor", async (t) => {
  const tryCpServer = await TryCpServer.start();

  const scenario = new TryCpScenario();
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
  const client = await scenario.addClient(SERVER_URL);
  t.ok(client, "client set up");

  const alice = await scenario.addPlayerWithHapp(client, {
    dnas: [{ source: { path: FIXTURE_DNA_URL.pathname } }],
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
  const client1 = await scenario.addClient(serverUrl1);
  const client2 = await scenario.addClient(serverUrl2);
  t.ok(client1, "client 1 set up");
  t.ok(client2, "client 2 set up");

  const alice = await scenario.addPlayerWithHapp(client1, {
    dnas: [{ source: { path: FIXTURE_DNA_URL.pathname } }],
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

  const bob = await scenario.addPlayerWithHapp(client2, {
    dnas: [{ source: { path: FIXTURE_DNA_URL.pathname } }],
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
  const client = await scenario.addClient(SERVER_URL);

  const alice = await scenario.addPlayerWithHapp(client, [
    { path: FIXTURE_DNA_URL.pathname },
  ]);

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
  const dnas: Dna[] = [{ source: { path: FIXTURE_DNA_URL.pathname } }];
  const [alice, bob] = await scenario.addPlayersWithHapps(client, [
    { dnas, signalHandler: signalHandlerAlice },
    { dnas, signalHandler: signalHandlerBob },
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
    actualSignalAlice.data.payload,
    signalAlice,
    "received alice's signal"
  );
  t.deepEqual(actualSignalBob.data.payload, signalBob, "received bob's signal");

  await scenario.cleanUp();
  await tryCpServer.stop();
});

test("TryCp Scenario - create and read an entry, 2 conductors", async (t) => {
  const tryCpServer = await TryCpServer.start();

  const scenario = new TryCpScenario();
  const client = await scenario.addClient(SERVER_URL);

  const [alice, bob] = await scenario.addPlayersWithHapps(client, [
    [{ path: FIXTURE_DNA_URL.pathname }],
    [{ path: FIXTURE_DNA_URL.pathname }],
  ]);
  await scenario.shareAllAgents();

  const content = "Hi dare";
  const createEntryHash = await alice.cells[0].callZome<EntryHash>({
    zome_name: "coordinator",
    fn_name: "create",
    payload: content,
  });

  await pause(100);

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
  const client = await scenario.addClient(SERVER_URL);

  const [alice, bob] = await scenario.addPlayersWithHapps(client, [
    [{ path: FIXTURE_DNA_URL.pathname }],
    [{ path: FIXTURE_DNA_URL.pathname }],
  ]);
  await scenario.shareAllAgents();

  const content = "Before shutdown";
  const createEntryHash = await alice.cells[0].callZome<EntryHash>({
    zome_name: "coordinator",
    fn_name: "create",
    payload: content,
  });
  await pause(100);
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
  await scenario.addClientsPlayers(serverUrls);
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
  await Promise.all(tryCpServers.map((tryCpServer) => tryCpServer.stop()));
});

test("TryCP Scenario - create multiple conductors for multiple clients", async (t) => {
  const numberOfServers = 2;
  const numberOfConductorsPerClient = 3;
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
  await scenario.addClientsPlayers(serverUrls, {
    numberOfConductorsPerClient,
  });

  for (const [i, client] of scenario.clients.entries()) {
    t.ok(
      client.conductors.length === numberOfConductorsPerClient,
      `client ${i + 1} has expected number of conductors`
    );
    for (const [j, conductor] of client.conductors.entries()) {
      const agentPubKey = await conductor.adminWs().generateAgentPubKey();
      t.ok(
        agentPubKey,
        `conductor ${j + 1} of client ${i + 1} responds with success`
      );
    }
  }

  await scenario.cleanUp();
  await Promise.all(tryCpServers.map((tryCpServer) => tryCpServer.stop()));
});

test("TryCP Scenario - create multiple agents for multiple conductors for multiple clients", async (t) => {
  const numberOfServers = 2;
  const numberOfConductorsPerClient = 2;
  const numberOfAgentsPerConductor = 3;
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
  const clientsPlayers = await scenario.addClientsPlayers(serverUrls, {
    numberOfConductorsPerClient,
    numberOfAgentsPerConductor,
    dnas: [{ source: { path: FIXTURE_DNA_URL.pathname } }],
  });

  for (const [i, clientPlayers] of clientsPlayers.entries()) {
    t.ok(
      clientPlayers.players.length ===
        numberOfConductorsPerClient * numberOfAgentsPerConductor,
      `client ${i + 1} has expected number of players`
    );
  }

  await scenario.cleanUp();
  await Promise.all(tryCpServers.map((tryCpServer) => tryCpServer.stop()));
});
