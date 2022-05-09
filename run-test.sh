#!/bin/bash

cd ts/test/fixture/zomes/entry
cargo build --release --target wasm32-unknown-unknown

cd ../../ # into fixtures
hc dna pack . -o entry.dna
hc app pack . -o entry.happ
cd ../../..
npm install
npm run test