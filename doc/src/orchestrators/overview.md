# Scenario Test Orchestrators

The new Scenario API will allow a scenario to be run on a variety of "orchestrators". Here are some of the orchestrators we have in mind.

## Dev Orchestrator 1.0 (D1) a.k.a Playbook

*in development*

D1, tentatively named `playbook`, is a more or less direct replacement of the existing Node test conductor. It spins up a normal Rust conductor as a subprocess, using an admin interface to set up and tear down agents, DNAs, and instances for use by the scenarios.

This should be as fast as possible, so as much state as possible is shared between tests. A single conductor process runs for the entire duration of the test suite, and agents and DNAs are cached, i.e. only set up, never torn down. Instances are set up and torn down for each test, to ensure a clean slate for each test.

## Dev Orchestrator 2.0 (D2)

D2 takes D1 to the next level, and will probably replace it. Rather than relying on the production Rust conductor, it will be backed by a special test conductor which, rather than running event loops, allows the orchestrator to manually advance "time", offering more fine-grained control, allowing various timing-based scenarios to be properly modeled.

Again, this orchestrator will be geared towards fast execution and rapid local testing -- even moreso than D1, since we don't have to wait for real time to pass.

## Local Network Orchestrator (LNO)

*in development*

This orchestrator spins up a separate conductor process for each instance and connects them over a real (local) lib3h network. This is used to test the hApp under real network conditions, as well as to run holochain/lib3h through the paces of a real world situation in realistic end2end tests.

## Emulated Network Orchestrator (ENO)

This takes LNO a step further, and using AWS, actually provisions machines on, different VPNs, in different parts of the world, to emulate a true real-world network, complete with real propagation delay.
