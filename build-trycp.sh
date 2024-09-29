#!/bin/bash
set -e

# build TryCP server
cargo build -p trycp_server --target-dir crates/trycp_server/target
