[![Project](https://img.shields.io/badge/Project-Holochain-blue.svg?style=flat-square)](http://holochain.org/)
[![Forum](https://img.shields.io/badge/Forum-forum%2eholochain%2enet-blue.svg?style=flat-square)](https://forum.holochain.org)
[![License: CAL 1.0](https://img.shields.io/badge/License-CAL%201.0-blue.svg)](https://github.com/holochain/cryptographic-autonomy-license)
![Test](https://github.com/holochain/holochain-client-js/actions/workflows/test.yml/badge.svg?branch=main)

# Tryorama

Tryorama provides a convenient way to run an arbitrary amount of Holochain
conductors on your local machine, as well as on network nodes that are running
the TryCP service. In combination with the test runner and assertion library of
your choice, you can test the behavior of multiple Holochain nodes in a
network. Included functions to clean up used resources make sure that all state
is deleted between tests so that they are independent of one another.

```sh
npm install @holochain/tryorama
```

[Complete API reference](./docs/tryorama.md)

## Example

With a few lines of code you can start testing your Holochain application. This
example uses [tape](https://github.com/substack/tape) as test runner and
assertion library. You can choose any other runner and library.

```ts
import { DnaSource, HeaderHash } from "@holochain/client";
import { pause, runScenario, Scenario } from "@holochain/tryorama";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "tape-promise/tape.js";

test("Create 2 players and create and read an entry", async (t) => {
  await runScenario(async (scenario: Scenario) => {
    // Construct proper paths for your DNAs.
    // This assumes DNA files created by the `hc dna pack` command.
    const testDnaPath = dirname(fileURLToPath(import.meta.url)) + "/test.dna";

    // Set up the array of DNAs to be installed, which only consists of the
    // test DNA referenced by path.
    const dnas: DnaSource[] = [{ path: testDnaPath }];

    // Add 2 players with the test DNA to the Scenario. The returned players
    // can be destructured.
    const [alice, bob] = await scenario.addPlayersWithHapps([dnas, dnas]);

    // Shortcut peer discovery through gossip and register all agents in every
    // conductor of the scenario.
    await scenario.shareAllAgents();

    // Content to be passed to the zome function that create an entry,
    const content = "Hello Tryorama";

    // The cells of the installed hApp are returned in the same order as the DNAs
    // that were passed into the player creation.
    const createEntryHash: HeaderHash = await alice.cells[0].callZome({
      zome_name: "crud",
      fn_name: "create",
      payload: content,
    });

    // Wait for the created entry to be propagated to the other node.
    await pause(100);

    // Using the same cell and zome as before, the second player reads the
    // created entry.
    const readContent: typeof content = await bob.cells[0].callZome({
      zome_name: "crud",
      fn_name: "read",
      payload: createEntryHash,
    });
    t.equal(readContent, content);
  });
});
```

> Have a look at the [tests](./ts/test/local/scenario.ts) for many more examples.

### Example without wrapper

Written out without the wrapper function, the same example looks like this:

```ts
import { DnaSource, HeaderHash } from "@holochain/client";
import { pause, Scenario } from "@holochain/tryorama";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "tape-promise/tape.js";

test("Create 2 players and create and read an entry", async (t) => {
  const testDnaPath = dirname(fileURLToPath(import.meta.url)) + "/test.dna";
  const dnas: DnaSource[] = [{ path: testDnaPath }];

  // Create an empty scenario.
  const scenario = new Scenario();
  const [alice, bob] = await scenario.addPlayersWithHapps([dnas, dnas]);

  await scenario.shareAllAgents();

  const content = "Hello Tryorama";
  const createEntryHash: EntryHash = await alice.cells[0].callZome({
    zome_name: "crud",
    fn_name: "create",
    payload: content,
  });

  await pause(100);

  const readContent: typeof content = await bob.cells[0].callZome({
    zome_name: "crud",
    fn_name: "read",
    payload: createEntryHash,
  });
  t.equal(readContent, content);

  // Shut down all conductors and delete their files and directories.
  await scenario.cleanUp();
});
```

> The wrapper takes care of creating a scenario and shutting down or deleting
all conductors involved in the test scenario.

### Error handling with test runners like `tape`

When writing the test, it might be necessary to handle errors while developing,
depending on the test runner. With a test runner like "tape", uncaught errors
will cause the conductor process and therefore the test to hang or output
`[object Object]` as the only error message. In this case errors can be handled
like this:

```ts
const scenario = new LocalScenario();
try {
  /* scenario operations */
} catch (error) {
  console.error("error occurred during test", error);
} finally (
  await scenario.cleanUp()
}
```

## Concepts

[Scenarios](./docs/tryorama.scenario.md) provide high-level functions to
interact with the Holochain Conductor API. [Players](./docs/tryorama.player.md)
consist of a conductor, an agent and installed hApps, and can be added to a
Scenario. Access to installed hApps is made available through the cells,
which can either be destructured according to the sequence during installation
or retrieved by their role id.

One level underneath the Scenario is the
[Conductor](./docs/tryorama.localconductor.md). Apart from methods for
creation, startup and shutdown, it comes with complete functionality of Admin
and App API that the JavaScript client offers.

### Conductor example

Here is the above example that just uses a `Conductor` without a `Scenario`:

```ts
  const testDnaPath = dirname(fileURLToPath(import.meta.url)) + "/test.dna";
  const dnas: DnaSource[] = [{ path: testDnaPath }];

  const conductor1 = await createConductor();
  const conductor2 = await createConductor();
  const [aliceHapps, bobHapps] = await conductor1.installAgentsHapps({
    agentsDnas: [dnas, dnas],
  });

  await addAllAgentsToAllConductors([conductor1, conductor2]);

  const entryContent = "test-content";
  const createEntryHash: EntryHash = await aliceHapps.cells[0].callZome({
    zome_name: "crud",
    fn_name: "create",
    payload: entryContent,
  });

  await pause(100);

  const readEntryResponse: typeof entryContent =
    await bobHapps.cells[0].callZome({
      zome_name: "crud",
      fn_name: "read",
      payload: createEntryHash,
    });

  await conductor1.shutDown();
  await conductor2.shutDown();
  await cleanAllConductors();
```

> Note that you need to set a [UID](https://docs.rs/holochain_types/latest/holochain_types/app/struct.RegisterDnaPayload.html#structfield.uid)
manually when registering DNAs. This is taken care of automatically when using
a `Scenario`.

## hApp Installation

Conductors are equipped with a method for easy hApp installation,
[installAgentsHapps](./docs/tryorama.conductor.installagentshapps.md). It has a
almost identical signature to `Scenario.addPlayers` and takes an array of DNAs
for each agent, resulting in a 2-dimensional array, e. g.
`[[agent1dna1, agent1dna2], [agent2dna1], [agent3dna1, agent3dna2, agent3dna3]]`.

```typescript
const testDnaPath = dirname(fileURLToPath(import.meta.url)) + "/test.dna";
const dnas: DnaSource[] = [{ path: testDnaPath }];

const conductor = await createLocalConductor();
const [aliceHapps] = await conductor.installAgentsHapps({
  agentsDnas: [dnas],
});

const entryContent = "test-content";
const createEntryHash: EntryHash = await aliceHapps.cells[0].callZome({
  zome_name: "crud",
  fn_name: "create",
  payload: entryContent,
});

await conductor.shutDown();
```

### Convenience function for Zome calls

When testing a Zome, there are usually a lot of calls to the cell with this
particular Zome. Specifying the Cell and the Zome name for every call is
repetitive. It is therefore convenient to use a handle to a particular
combination of Cell and Zome.

Instead of

```typescript
const [aliceHapps] = await conductor.installAgentsHapps({
  agentsDnas: [dnas],
});
const createEntryHash: EntryHash = await aliceHapps.cells[0].callZome({
  zome_name: "crud",
  fn_name: "create",
  payload: entryContent,
});
const readEntryHash: string = await aliceHapps.cells[0].callZome({
  zome_name: "crud",
  fn_name: "read",
  payload: createEntryHash,
});
```

the shorthand access to the Zome can be called

```typescript
const [aliceHapps] = await conductor.installAgentsHapps({
  agentsDnas: [dnas],
});
const aliceCrudZomeCall = getZomeCaller(aliceHapps.cells[0], "crud");
const entryHeaderHash: HeaderHash = await crudZomeCall(
  "create",
  "test-entry"
);
const readEntryHash: string = await crudZomeCall(
  "read",
  entryHeaderHash
);
```

## Signals

`Scenario.addPlayer` as well as `Conductor.installAgentsHapps` allow for an
optional signal handler to be specified. Signal handlers are registered with
the conductor and act as a callback when a signal is received.

```typescript
const scenario = new LocalScenario();
const testDnaPath = dirname(fileURLToPath(import.meta.url)) + "/test.dna";
const dnas: DnaSource[] = [{ path: testDnaPath }];
d
let signalHandler: AppSignalCb | undefined;
const signalReceived = new Promise<AppSignal>((resolve) => {
  signalHandler = (signal) => {
    resolve(signal);
  };
});

const alice = await scenario.addPlayerWithHapp(dna, signalHandler);

const signal = { value: "hello alice" };
alice.cells[0].callZome({
  zome_name: "crud",
  fn_name: "signal_loopback",
  payload: signal,
});

const actualSignalAlice = await signalReceived;
t.deepEqual(actualSignalAlice.data.payload, signal);

await scenario.cleanUp();
```
