# Tests for Holochain RSM

As Holochain RSM evolves, so will Tryorama. The new version of Tryorama is still a work in progress, but the new test suite will exist here. Tryorama will be ready for a full new release once all existing tests work against the new Holochain, after which this package.json will be merged with the root level package.json.

## How to run tests

Prerequisites:

- Have a `holochain-2020` on the path, built from commit `7297ffbf7c9f814f434b384ddf96209c847afc03` or later.
- must have a valid test.dna.gz present in this directory which contains the "foo" wasm from Holochain's `crates/test_utils/wasm/foo` crate.

Then, just fire off the tests from this directory:

    npm test
