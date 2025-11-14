[![Project](https://img.shields.io/badge/Project-Holochain-blue.svg?style=flat-square)](http://holochain.org/)
[![Discord](https://img.shields.io/badge/Discord-DEV.HC-blue.svg?style=flat-square)](https://discord.gg/k55DS5dmPH)
[![License: CAL 1.0](https://img.shields.io/badge/License-CAL%201.0-blue.svg)](https://github.com/holochain/cryptographic-autonomy-license)
[![Test](https://github.com/holochain/tryorama/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/holochain/tryorama/actions/workflows/test.yml)
# Tryorama

Tryorama provides a convenient way to run an arbitrary amount of Holochain
conductors on your local machine. In combination with the test runner and assertion library of
your choice, you can test the behavior of multiple Holochain nodes in a
network. Included functions to clean up used resources make sure that all state
is deleted between tests so that they are independent of one another.

```sh
npm install @holochain/tryorama
```

[Complete API reference](./docs/tryorama.md)

## Compatibility

**Tryorama v0.19.x** is compatible with **JS client v0.20.x** and **Holochain v0.6.x**.

**Tryorama v0.18.x** is compatible with **JS client v0.19.x** and **Holochain v0.5.x**.

**Tryorama v0.17.x** is compatible with **JS client v0.18.x** and **Holochain v0.4.x**.

## Example

With a few lines of code you can start testing your Holochain application. The
examples in this repository use [tape](https://github.com/substack/tape) as
test runner and assertion library. You can choose any other runner and library.

> [Example with 2 conductors creating and reading an entry.](./ts/test/local/scenario.ts#L110)

There are lots of examples for working with scenarios and conductors
in the [`scenario`](./ts/test/local/scenario.ts) and 
[`conductor`](./ts/test/local/conductor.ts) test folders.


### Curried function to get a zome caller

> [Example](./ts/test/local/scenario.ts#L158)

## Signals

`Scenario.addPlayerWithHapp` as well as `Conductor.installAgentsHapps` allow for a
signal handler to be specified. Signal handlers are registered with
the conductor and act as a callback when a signal is received.

> [Example sending and receiving a signal](./ts/test//local//scenario.ts#L193)

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
