#!/bin/bash
set -e

# build test hApp
cd ts/test/fixture/zomes/integrity
echo "build integrity zome..."
RUSTFLAGS='--cfg getrandom_backend="custom"' cargo build --release --target wasm32-unknown-unknown
cd ../coordinator
echo "build coordinator zome..."
RUSTFLAGS='--cfg getrandom_backend="custom"' cargo build --release --target wasm32-unknown-unknown
cd ../.. # into fixtures
hc dna pack . -o entry.dna
hc app pack . -o entry.happ
