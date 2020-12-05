#!/bin/bash
echo `pwd`
cd test/e2e/fixture/zomes/link
cargo build --release --target wasm32-unknown-unknown --target-dir ./target
cp target/wasm32-unknown-unknown/release/test_wasm_link.wasm ../../../link.dna.workdir
cd ../../..
dna-util -c link.dna.workdir
cd ../..
npm install
npm run test
