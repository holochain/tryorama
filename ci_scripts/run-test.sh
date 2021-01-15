#!/bin/bash
echo `pwd`
cd test/e2e/fixture/zomes/test
cargo build --release --target wasm32-unknown-unknown --target-dir ./target
cp target/wasm32-unknown-unknown/release/test_wasm.wasm ../../../test.dna.workdir/test.wasm
cd ../../..
dna-util -c test.dna.workdir
cd ../..
npm install
npm run test