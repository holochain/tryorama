# Scenario Tests 2.0

This document is the anchor for all topics related to the next iteration of Scenario testing on Holochain. The Topics section below contains links to other specific topics, and below that follows general definitions and context setting.

## Topics

### [Scenario Syntax &raquo;](./scenarios.md)

The syntax and structure of defining an abstract *scenario* which can be run on any *orchestrator*

### [Orchestrators &raquo;](./orchestrators.md)

A runtime context which can run a *scenario*

## Definitions

**scenario (n)**:
1. A function that specifies how to call a sequence of zome function calls on various instances, abstractly, without being tied to any concrete instances.
2. More specifically: A description of a sequence of zome function calls that may occur on one or more DNA instances, with the opportunity to make assertions about intermediate values returned, and the ability to defer events until others have occurred.

**orchestrator (n)**: A swappable "backend" which can run a scenario by spinning up one or more conductors to handle the zome function calls specified in the scenario.

**waiter (n)**:
1. One that waits.
2. A model of the cause-and-effect relationships between Actions that are produced by a conductor.
    - e.g. every `Commit` action on a publishable entry is the *cause* of multiple `Hold` actions (*effects*) which will occur on the validating instances for that entry some time in the future
3. The engine for applying that model to a real-time stream of Actions, exposing an interface through which a scenario (via an orchestrator) can request to defer executing certain code until certain

## Motivation / Wants / Constraints

Scenario testing is a kind of end-to-end testing that tests certain specific, well, scenarios. It is not intended to comprehensively test a hApp or any piece of software, but it is a great tool for understanding the situations that can arise, vetting the basic intended use of an app, and for adding regression tests for complicated situations that may have cropped up.

### Pure representation

We want to be able to specify a scenario as purely as possible, so that it can be run against any "orchestrator", e.g.:

* A single conductor which quickly runs the scenario using a full-sync `InMemoryNetwork`, to test DNA logic
* A cluster of conductors connected by a real lib3h network of arbitrary topology, perhaps even modeling extreme latency, partitions, and other networking edge cases

This lets each scenario test not only the DNAs it is written for, but all of Holochain, including networking.

### Making eventual consistency easy

One big assumption is that many app developers want to test the logic of their app under the conditions of *consistency*. Every Holochain developer knows that the DHT is eventually consistent. Some hApps (e.g. Holofuel) will need to, in the real world, know that consistency has been achieved before moving forward with certain actions. However, other hApps (e.g. Chat) can operate under various stages of inconsistency, and thus the developer will want to write tests that check the state of things when consistency has been reached, *whenever that may be*.

To clarify this distinction: In Holofuel, a multi-stage transaction cannot proceed until each side is sure that the last stage of the transaction has reached a certain level of saturation in the DHT, so it will need to carefully verify this. In the case of Chat however, the hApp will not restrict users from typing new messages before all messages from all users have been seen. That's because this isn't even possible in the real world! But in a test harness it is, since we have total knowledge of the actions of all agents. Therefore, it can be useful to write a test that checks the state of things after consistency has been reached, since we can know exactly when that will be, globally.
