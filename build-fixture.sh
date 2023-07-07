#!/bin/bash

# build test hApp
cd ts/test/fixture/zomes/integrity
echo "build integrity zome..."
cargo build --release --target wasm32-unknown-unknown
cd ../coordinator
echo "build coordinator zome..."
cargo build --release --target wasm32-unknown-unknown
cd ../.. # into fixtures
hc dna pack . -o entry.dna
hc app pack . -o entry.happ
