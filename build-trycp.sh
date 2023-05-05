#!/bin/bash

# build TryCP server
cd crates/trycp_server
cargo build --release --target-dir target
