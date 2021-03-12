#!/bin/bash
echo `pwd`
cd test/e2e/fixture/zomes/test
# target at top level to share with trycp_server builds and for github CI caching
cargo build --release --target wasm32-unknown-unknown --target-dir ../../../../../target
cd ../.. #into fixtures
hc dna pack . -o test.dna
hc app pack . -o test.happ
cd ../../..
npm install
npm run test
