# Running the tryoram tests

Prerequisites:

### Holochain binary

You must have a `holochain` binary on the path:
- Clone the [Holochain repo](https://github.com/holochain/holochain)
- Get the correct holochain build environment with: `cd holochain && nix-shell`

### Test DNA

There is a test dna that is included as a fixture in the repo.  This only needs to be recompiled if the version of holochain/hdk tryorama is being tested against, changes.  Assuming you already have the `holochain` and `dna-util` binary installed, you can simply run:

``` sh
ci_scripts/run-test.sh
```

which will both compile and assemble the DNA as well as run the tests.  Otherwise you can just do the usual:

``` sh
npm install
npm test
```

### Note to tryorama devs

When updating tryorama against a new version of holochain please replace the old holochain sha in all of these places:

```
./README.md
 test/e2e/fixture/zomes/test/Cargo.toml
ci_scripts/install-holochain.sh
```

Also, remember that [holochain-conductor-api](https://github.com/holochain/holochain-conductor-api) must be compatible with which-ever version of Holochain being used.

x