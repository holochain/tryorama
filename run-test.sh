#!/bin/bash

cd ts/test/e2e/fixture/zomes/entry
cargo build --release --target wasm32-unknown-unknown

cd ../.. # into fixtures
hc dna pack . -o test.dna
hc app pack . -o test.happ
# cd ../../..
# npm install
# npm run test