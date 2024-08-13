#!/bin/bash
set -e

# build TryCP server
cargo build --release --manifest-path crates/trycp_server/Cargo.toml
