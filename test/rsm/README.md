# Tests for Holochain RSM

As Holochain RSM evolves, so will Tryorama. The new version of Tryorama is still a work in progress, but the new test suite will exist here. Tryorama will be ready for a full new release once all existing tests work against the new Holochain, after which this package.json will be merged with the root level package.json.


Prerequisites:

### Holochain binary

You must have a `holochain` binary on the path:
- Clone the [Holochain repo](https://github.com/holochain/holochain)
- Get the correct holochain build environment with: `cd holochain && nix-shell`

### Test DNA

You must have a valid `test.dna.gz` present in this directory which contains at least the "foo" wasm from Holochain's `crates/test_utils/wasm/foo` crate.

If you are building this DNA using `dna-util`, then you should have a `test.dna.workdir/dna.json` that looks something like this:

```json
{
  "name": "test-dna",
  "uuid": "",
  "properties": null,
  "zomes": {
    "foo": {
      "wasm_path": "./foo.wasm"
    }
  }
}
```

## Running tests

When prerequisites are met, be sure to install dependencies:

    npm install

Then, you can fire off the tests (make sure you are in this directory):

    npm test
