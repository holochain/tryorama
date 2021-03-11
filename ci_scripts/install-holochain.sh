#!/bin/bash

REV=3d894ef9364f84c24386a3eb6162c8aba15ffe59
LAIR_REV=be5868e6dcbe99c795a101c0e27ba6ed5edd557d

export CARGO_TARGET_DIR="$PWD/target"
echo $CARGO_TARGET_DIR
cargo install --force holochain \
  --git https://github.com/holochain/holochain.git \
  --rev $REV
cargo install holochain_cli --force --bin hc \
  --git https://github.com/holochain/holochain.git \
  --rev $REV
cargo install --force lair_keystore \
  --git https://github.com/holochain/lair.git \
  --rev $LAIR_REV
