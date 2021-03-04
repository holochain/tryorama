#!/bin/bash

REV=5812b41398e857134f780621dc1aa7bc6c05c5f0
LAIR_REV=be5868e6dcbe99c795a101c0e27ba6ed5edd557d

#export CARGO_TARGET_DIR="$PWD/target"
#echo $CARGO_TARGET_DIR
cargo install --force holochain \
  --git https://github.com/holochain/holochain.git \
  --rev $REV
cargo install holochain_cli --force --bin hc \
  --git https://github.com/holochain/holochain.git \
  --rev $REV
cargo install --force lair_keystore \
  --git https://github.com/holochain/lair.git \
  --rev $LAIR_REV
