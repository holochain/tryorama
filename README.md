[![Project](https://img.shields.io/badge/Project-Holochain-blue.svg?style=flat-square)](http://holochain.org/)
[![Discord](https://img.shields.io/badge/Discord-DEV.HC-blue.svg?style=flat-square)](https://discord.gg/k55DS5dmPH)
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

```typescript
import { ActionHash, DnaSource } from "@holochain/client";
import {
  Scenario,
  getZomeCaller,
  pause,
  runScenario,
} from "@holochain/tryorama";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "tape-promise/tape.js";

test("Create 2 players and create and read an entry", async (t) => {
  await runScenario(async (scenario: Scenario) => {
    // Construct proper paths for a hApp file created by the `hc app pack` command.
    const testHappUrl = dirname(fileURLToPath(import.meta.url)) + "/test.happ";

    // Add 2 players with the test hApp to the Scenario. The returned players
    // can be destructured.
    const [alice, bob] = await scenario.addPlayersWithApps([
      { appBundleSource: { path: testHappUrl } },
      { appBundleSource: { path: testHappUrl } },
    ]);

    // Shortcut peer discovery through gossip and register all agents in every
    // conductor of the scenario.
    await scenario.shareAllAgents();

    // Content to be passed to the zome function that create an entry,
    const content = "Hello Tryorama";

    // The cells of the installed hApp are returned in the same order as the DNAs
    // in the app manifest.
    const createEntryHash: ActionHash = await alice.cells[0].callZome({
      zome_name: "coordinator",
      fn_name: "create",
      payload: content,
    });

    // Wait for the created entry to be propagated to the other node.
    await pause(100);

    // Using the same cell and zome as before, the second player reads the
    // created entry.
    const readContent: typeof content = await bob.cells[0].callZome({
      zome_name: "coordinator",
      fn_name: "read",
      payload: createEntryHash,
    });
    t.equal(readContent, content);
  });
});
```

> Have a look at the [tests](./ts/test/local/scenario.ts) for many more examples.

### Curried function to get a zome caller

During a test usually a specific zome of a specific agent is called repeatedly.
You can avail of a curried function for making these calls.

```typescript
const alice = await scenario.addPlayerWithApp({ path: testHappUrl });

// Get shortcut functions to call a specific zome of a specific agent
const aliceCoordinatorCaller = getZomeCaller(alice.cells[0], "coordinator");

const content = "Hello Tryorama";
// Use the curried function to call alice's coordinator zome
const createEntryHash: ActionHash = await aliceCoordinatorCaller(
  "create",
  content
);

// Use the caller for another of alice's zome functions
const readContent: typeof content = await aliceCoordinatorCaller(
  "read",
  createEntryHash
);
```

### Example without wrapper

Written out without the wrapper function, the same example looks like this:

```typescript
import { ActionHash, DnaSource } from "@holochain/client";
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
    zome_name: "coordinator",
    fn_name: "create",
    payload: content,
  });

  await pause(100);

  const readContent: typeof content = await bob.cells[0].callZome({
    zome_name: "coordinator",
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

### Logging

The log level can be set with the environment variable `TRYORAMA_LOG_LEVEL`.
Log levels used in Tryorama are `debug`, `verbose` and `info`. The default
level is `info`. To set the log level for a test run, prepend the test command
with:

```bash
TRYORAMA_LOG_LEVEL=debug node test.js
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

```typescript
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
    zome_name: "coordinator",
    fn_name: "create",
    payload: entryContent,
  });

  await pause(100);

  const readEntryResponse: typeof entryContent =
    await bobHapps.cells[0].callZome({
      zome_name: "coordinator",
      fn_name: "read",
      payload: createEntryHash,
    });

  await conductor1.shutDown();
  await conductor2.shutDown();
  await cleanAllConductors();
```

> Note that you need to set a [network seed](https://docs.rs/holochain_types/latest/holochain_types/app/struct.RegisterDnaPayload.html#structfield.network_seed)
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
  zome_name: "coordinator",
  fn_name: "create",
  payload: entryContent,
});

await conductor.shutDown();
```

## Signals

`Scenario.addPlayerWithHapp` as well as `Conductor.installAgentsHapps` allow for a
signal handler to be specified. Signal handlers are registered with
the conductor and act as a callback when a signal is received.

```typescript
const scenario = new Scenario();
const testDnaPath = dirname(fileURLToPath(import.meta.url)) + "/test.dna";
const dnas: Dna[] = [{ source: { path: testDnaPath } }];

let signalHandler: AppSignalCb | undefined;
const signalReceived = new Promise<AppSignal>((resolve) => {
  signalHandler = (signal) => {
    resolve(signal);
  };
});

const alice = await scenario.addPlayerWithHapp({ dnas, signalHandler });

const signal = { value: "hello alice" };
alice.cells[0].callZome({
  zome_name: "coordinator",
  fn_name: "signal_loopback",
  payload: signal,
});

const actualSignalAlice = await signalReceived;
t.deepEqual(actualSignalAlice.data.payload, signal);

await scenario.cleanUp();
```
