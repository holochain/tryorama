# Scenario API

## Waiter

Some Scenario API methods are focused on waiting for consistency. This is accomplished through a Waiter. But I haven't decided how to actually implement the thing.

* Needs to be separate from any one conductor, because it may aggregate signals from multiple conductors, orchestrating them all.
* If implemented in Rust: 
    - the waiting logic is easy, 
    - but integration is harder, requiring the waiter to run as a separate service, with RPC interfaces
* If not implemented in Rust:
    - waiter can be integrated directly into the test orchestrator
    - listening to Actions is not good enough, because (at least) Addresses cannot be computed from Entries purely based on data.

Some ideas:

* Implement completely in Rust
    - use RPC to register actions and also to request waiting (where the response will only come back once the wait is over)
* Implement completely in JS based on serialized Signals. 
    - Requires another type of Signal with extra data included (Addresses especially)
    - This signal would only exist to enable testing.
* Implement partially in Rust, partially in JS
    - Something like: write the abstract causality stuff in Rust, and the network models in JS which concretizes the effects 
    - Send signals that also describe what effects to wait for (reference forward in time)
    - OR send signals that refer to their causes (reference backwards in time)
    - Lets waiting logic be written in Rust, but would require some kind of pattern matching to match the partial Actions, if Actions are used. If custom data is used, maybe it can be written so that the references completely match the corresponding signals. This is all very bespoke for testing though.
        + Might we need a new bit of State to manage this? Pretty heavy-handed just to enable testing..

## Methods:

### `consistency([instances])`

Wait for consistency on a subset of instances, or if no parameter is passed, wait for consistency across all nodes.

