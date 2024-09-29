#!/bin/bash
set -e

# build TryCP server
cargo build -p trycp_server --release --target-dir crates/trycp_server/target
