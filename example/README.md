# Tests for Holochain

Prerequisites:

### Holochain binary

You must have a `holochain` binary on the path:
- Clone the [Holochain repo](https://github.com/holochain/holochain)
- Get the correct holochain build environment with: `cd holochain && nix-shell`

### Test DNA

The test DNA included is from holochain's `crates/test_utils/wasm` and was generated like this:

``` sh
cd /path/to/holochain-repo/crates/test_utils/wasm/wasm_works
cargo build -p test_wasm_foo --release --target wasm32-unknown-unknown --target-dir ./target
cp test_wasm_foo.wasm /path/to/tryorama-repo/test/rsm/test.dna.workdir
cd /path/to/tryorama-repo/test/rsm
dna-util -c test.dna.workdir
```

## Running tests

When prerequisites are met, be sure to install dependencies:

    npm install

Then, you can fire off the tests (make sure you are in this directory):

    npm test
