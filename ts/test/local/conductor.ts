import {
  ActionHash,
  AppBundleSource,
  AppSignal,
  AppSignalCb,
  CloneId,
  EntryHash,
} from "@holochain/client";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import test from "tape-promise/tape.js";
import {
  enableAndGetAgentApp,
  getZomeCaller,
  runLocalServices,
  stopLocalServices,
} from "../../src";
import {
  NetworkType,
  Player,
  cleanAllConductors,
  createConductor,
} from "../../src";
import { dhtSync } from "../../src";
import { FIXTURE_HAPP_URL } from "../fixture";

const ROLE_NAME = "test";

test("Local Conductor - spawn a conductor with WebRTC network", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl, {
    networkType: NetworkType.WebRtc,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(
    tmpDirPath + "/conductor-config.yaml"
  ).toString();
  t.ok(conductorConfig.includes("- type: webrtc"));
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - spawn a conductor with mem network", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl, {
    networkType: NetworkType.Mem,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(
    tmpDirPath + "/conductor-config.yaml"
  ).toString();
  t.ok(conductorConfig.includes("transport_pool: []"));

  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - spawn a conductor with a bootstrap service", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const bootstrapUrl = new URL("https://test.bootstrap.com");
  const conductor = await createConductor(signalingServerUrl, {
    bootstrapServerUrl: bootstrapUrl,
    startup: false,
  });
  const tmpDirPath = conductor.getTmpDirectory();
  const conductorConfig = readFileSync(
    tmpDirPath + "/conductor-config.yaml"
  ).toString();
  t.ok(conductorConfig.includes("network_type: quic_bootstrap"));
  t.ok(conductorConfig.includes(`bootstrap_service: ${bootstrapUrl.href}`));

  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - spawn a conductor and check for admin ws", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  t.ok(conductor.adminWs());

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - get app info with app ws", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const app = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  await conductor
    .adminWs()
    .enableApp({ installed_app_id: app.installed_app_id });
  const port = await conductor.attachAppInterface();
  const issued = await conductor
    .adminWs()
    .issueAppAuthenticationToken({ installed_app_id: app.installed_app_id });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const appInfo = await appWs.appInfo();
  assert(appInfo);
  t.deepEqual(appInfo.status, { running: null });
  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - get app info with app agent ws", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const app = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  await conductor
    .adminWs()
    .enableApp({ installed_app_id: app.installed_app_id });
  const port = await conductor.attachAppInterface();
  const issued = await conductor
    .adminWs()
    .issueAppAuthenticationToken({ installed_app_id: app.installed_app_id });
  const appAgentWs = await conductor.connectAppWs(issued.token, port);
  const appInfo = await appAgentWs.appInfo();
  t.deepEqual(appInfo.status, { running: null });
  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - install and call an app", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const app = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  const appAgentWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appAgentWs, app);
  t.ok(app.installed_app_id);

  const entryContent = "Bye bye, world";
  const createEntryResponse: EntryHash = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "create",
    payload: entryContent,
  });
  t.ok(createEntryResponse);
  const readEntryResponse: typeof entryContent = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryResponse,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - get a convenience function for zome calls", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const app = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, app);

  const coordinatorZomeCall = getZomeCaller(alice.cells[0], "coordinator");
  t.equal(
    typeof coordinatorZomeCall,
    "function",
    "getZomeCaller returns a function"
  );

  const entryHeaderHash: ActionHash = await coordinatorZomeCall(
    "create",
    "test-entry"
  );
  const entryHeaderHashB64 = Buffer.from(entryHeaderHash).toString("base64");
  t.equal(entryHeaderHash.length, 39, "ActionHash is 39 bytes long");
  t.ok(entryHeaderHashB64.startsWith("hCkk"), "ActionHash starts with hCkk");

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - install multiple agents and apps and get access to agents and cells", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const [aliceApp, bobApp] = await conductor.installAgentsApps({
    agentsApps: [
      { app: { path: FIXTURE_HAPP_URL.pathname } },
      { app: { path: FIXTURE_HAPP_URL.pathname } },
    ],
  });
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issuedAlice = await adminWs.issueAppAuthenticationToken({
    installed_app_id: aliceApp.installed_app_id,
  });
  const issuedBob = await adminWs.issueAppAuthenticationToken({
    installed_app_id: bobApp.installed_app_id,
  });
  const appWsAlice = await conductor.connectAppWs(issuedAlice.token, port);
  const appWsBob = await conductor.connectAppWs(issuedBob.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWsAlice, aliceApp);
  const bob = await enableAndGetAgentApp(adminWs, appWsBob, bobApp);

  alice.cells.forEach((cell) =>
    t.deepEqual(cell.cell_id[1], alice.agentPubKey)
  );
  bob.cells.forEach((cell) => t.deepEqual(cell.cell_id[1], bob.agentPubKey));

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - get a named cell by role name", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const app = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, app);
  t.ok(alice.namedCells.get(ROLE_NAME), "dna role name matches");

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - zome call can time out before completion", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const app = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, app);
  const cell = alice.namedCells.get(ROLE_NAME);
  assert(cell);

  await t.rejects(
    cell.callZome(
      { zome_name: "coordinator", fn_name: "create", payload: "test" },
      1
    )
  );

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - create and read an entry using the entry zome", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);

  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const agentPubKeyB64 = Buffer.from(agentPubKey).toString("base64");
  t.equal(agentPubKey.length, 39);
  t.ok(agentPubKeyB64.startsWith("hCAk"));

  const installed_app_id = "entry-app";
  const app = await conductor.installApp(
    { path: FIXTURE_HAPP_URL.pathname },
    {
      installedAppId: installed_app_id,
      agentPubKey,
    }
  );
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, app);
  const { cell_id } = alice.cells[0];
  t.ok(Buffer.from(cell_id[0]).toString("base64").startsWith("hC0k"));
  t.ok(Buffer.from(cell_id[1]).toString("base64").startsWith("hCAk"));

  const entryContent = "test-content";
  const createEntryHash: EntryHash = await appWs.callZome({
    cap_secret: null,
    cell_id,
    zome_name: "coordinator",
    fn_name: "create",
    provenance: agentPubKey,
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39);
  t.ok(createdEntryHashB64.startsWith("hCkk"));

  const readEntryResponse: typeof entryContent = await appWs.callZome({
    cap_secret: null,
    cell_id,
    zome_name: "coordinator",
    fn_name: "read",
    provenance: agentPubKey,
    payload: createEntryHash,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - clone cell management", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  const conductor = await createConductor(signalingServerUrl);
  const agentPubKey = await conductor.adminWs().generateAgentPubKey();
  const appId = "entry-app";
  const app = await conductor.installApp(
    { path: FIXTURE_HAPP_URL.pathname },
    {
      installedAppId: appId,
      agentPubKey,
    }
  );
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: app.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, app);

  const cloneCell = await appWs.createCloneCell({
    role_name: ROLE_NAME,
    modifiers: { network_seed: "test-seed" },
  });
  t.deepEqual(
    cloneCell.clone_id,
    new CloneId(ROLE_NAME, 0).toString(),
    "clone id is 'role_name.0'"
  );
  t.deepEqual(
    cloneCell.cell_id[1],
    alice.cells[0].cell_id[1],
    "agent pub key in clone cell and base cell match"
  );

  const testContent = "test-content";
  const entryActionHash: ActionHash = await appWs.callZome({
    cell_id: cloneCell.cell_id,
    zome_name: "coordinator",
    fn_name: "create",
    payload: testContent,
    cap_secret: null,
    provenance: agentPubKey,
  });

  await appWs.disableCloneCell({
    clone_cell_id: cloneCell.cell_id,
  });
  await t.rejects(
    appWs.callZome({
      cell_id: cloneCell.cell_id,
      zome_name: "coordinator",
      fn_name: "read",
      payload: entryActionHash,
      cap_secret: null,
      provenance: agentPubKey,
    }),
    "disabled clone cell cannot be called"
  );

  const enabledCloneCell = await appWs.enableCloneCell({
    clone_cell_id: cloneCell.clone_id,
  });
  t.deepEqual(
    enabledCloneCell,
    cloneCell,
    "enabled clone cell matches created clone cell"
  );
  const readEntryResponse: typeof testContent = await appWs.callZome(
    {
      cell_id: cloneCell.cell_id,
      zome_name: "coordinator",
      fn_name: "read",
      payload: entryActionHash,
      cap_secret: null,
      provenance: agentPubKey,
    },
    40000
  );
  t.equal(readEntryResponse, testContent, "enabled clone cell can be called");

  await appWs.disableCloneCell({
    clone_cell_id: cloneCell.cell_id,
  });
  await conductor
    .adminWs()
    .deleteCloneCell({ app_id: appId, clone_cell_id: cloneCell.cell_id });
  await t.rejects(
    appWs.enableCloneCell({ clone_cell_id: cloneCell.clone_id }),
    "deleted clone cell cannot be enabled"
  );

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - 2 agent apps test", async (t) => {
  const { servicesProcess, bootstrapServerUrl, signalingServerUrl } =
    await runLocalServices();
  const app: AppBundleSource = { path: FIXTURE_HAPP_URL.pathname };

  const conductor1 = await createConductor(signalingServerUrl, {
    bootstrapServerUrl,
  });
  const conductor2 = await createConductor(signalingServerUrl, {
    bootstrapServerUrl,
  });

  const aliceApp = await conductor1.installApp(app);
  const bobApp = await conductor2.installApp(app);
  const adminWs1 = conductor1.adminWs();
  const adminWs2 = conductor2.adminWs();
  const port1 = await conductor1.attachAppInterface();
  const port2 = await conductor2.attachAppInterface();
  const issued1 = await adminWs1.issueAppAuthenticationToken({
    installed_app_id: aliceApp.installed_app_id,
  });
  const issued2 = await adminWs2.issueAppAuthenticationToken({
    installed_app_id: bobApp.installed_app_id,
  });
  const appAgentWs1 = await conductor1.connectAppWs(issued1.token, port1);
  const appAgentWs2 = await conductor2.connectAppWs(issued2.token, port2);
  const aliceAppAgent = await enableAndGetAgentApp(
    adminWs1,
    appAgentWs1,
    aliceApp
  );
  const bobAppAgent = await enableAndGetAgentApp(adminWs2, appAgentWs2, bobApp);
  const alice: Player = {
    conductor: conductor1,
    appWs: appAgentWs1,
    ...aliceAppAgent,
  };
  const bob: Player = {
    conductor: conductor2,
    appWs: appAgentWs2,
    ...bobAppAgent,
  };

  const entryContent = "test-content";
  const createEntryHash: EntryHash = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "create",
    payload: entryContent,
  });

  await dhtSync([alice, bob], alice.cells[0].cell_id[0]);

  const readEntryResponse: typeof entryContent = await bob.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor1.shutDown();
  await conductor2.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - create and read an entry, 2 conductors, 2 cells, 2 agents", async (t) => {
  const { servicesProcess, bootstrapServerUrl, signalingServerUrl } =
    await runLocalServices();
  const app: AppBundleSource = { path: FIXTURE_HAPP_URL.pathname };

  const conductor1 = await createConductor(signalingServerUrl, {
    bootstrapServerUrl,
  });
  const adminWs1 = conductor1.adminWs();
  const aliceApp = await conductor1.installApp(app);
  const port1 = await conductor1.attachAppInterface();
  const issued1 = await adminWs1.issueAppAuthenticationToken({
    installed_app_id: aliceApp.installed_app_id,
  });
  const appAgentWs1 = await conductor1.connectAppWs(issued1.token, port1);
  const aliceAppAgent = await enableAndGetAgentApp(
    adminWs1,
    appAgentWs1,
    aliceApp
  );
  const alice: Player = {
    conductor: conductor1,
    appWs: appAgentWs1,
    ...aliceAppAgent,
  };

  const conductor2 = await createConductor(signalingServerUrl, {
    bootstrapServerUrl,
  });
  const adminWs2 = conductor2.adminWs();
  const bobApp = await conductor2.installApp(app);
  const port2 = await conductor2.attachAppInterface();
  const issued2 = await adminWs2.issueAppAuthenticationToken({
    installed_app_id: bobApp.installed_app_id,
  });
  const appAgentWs2 = await conductor2.connectAppWs(issued2.token, port2);
  const bobAppAgent = await enableAndGetAgentApp(adminWs2, appAgentWs2, bobApp);
  const bob: Player = {
    conductor: conductor2,
    appWs: appAgentWs2,
    ...bobAppAgent,
  };

  const entryContent = "test-content";
  const createEntryHash: EntryHash = await alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "create",
    payload: entryContent,
  });
  const createdEntryHashB64 = Buffer.from(createEntryHash).toString("base64");
  t.equal(createEntryHash.length, 39);
  t.ok(createdEntryHashB64.startsWith("hCkk"));

  await dhtSync([alice, bob], alice.cells[0].cell_id[0]);

  const readEntryResponse: typeof entryContent = await bob.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(readEntryResponse, entryContent);

  await conductor1.shutDown();
  await conductor2.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});

test("Local Conductor - Receive a signal", async (t) => {
  const { servicesProcess, signalingServerUrl } = await runLocalServices();
  let signalHandler: AppSignalCb | undefined;
  const signalReceived = new Promise<AppSignal>((resolve) => {
    signalHandler = (signal) => {
      resolve(signal);
    };
  });
  const conductor = await createConductor(signalingServerUrl);

  const aliceApp = await conductor.installApp({
    path: FIXTURE_HAPP_URL.pathname,
  });
  const adminWs = conductor.adminWs();
  const port = await conductor.attachAppInterface();
  const issued = await adminWs.issueAppAuthenticationToken({
    installed_app_id: aliceApp.installed_app_id,
  });
  const appWs = await conductor.connectAppWs(issued.token, port);
  const alice = await enableAndGetAgentApp(adminWs, appWs, aliceApp);

  assert(signalHandler);
  appWs.on("signal", signalHandler);
  const aliceSignal = { value: "signal" };
  alice.cells[0].callZome({
    zome_name: "coordinator",
    fn_name: "signal_loopback",
    payload: aliceSignal,
  });
  const actualSignal = await signalReceived;
  t.deepEqual(actualSignal.payload, aliceSignal);

  await conductor.shutDown();
  await stopLocalServices(servicesProcess);
  await cleanAllConductors();
});
