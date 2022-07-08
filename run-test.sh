#!/bin/bash

# build TryCP server
cd crates/trycp_server
cargo build --release --target-dir target
cd ../..

# build test hApp
cd ts/test/fixture/zomes/integrity
cargo build --release --target wasm32-unknown-unknown
cd ../coordinator
cargo build --release --target wasm32-unknown-unknown
cd ../.. # into fixtures
hc dna pack . -o entry.dna
hc app pack . -o entry.happ
cd ../../..

# install node modules and run tests
npm cit