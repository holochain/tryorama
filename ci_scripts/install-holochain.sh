#!/bin/bash

REV=63b9fca72bf88b5760ad106256d3882f143d4f25
LAIR_REV=be5868e6dcbe99c795a101c0e27ba6ed5edd557d

export CARGO_TARGET_DIR="$PWD/target"
echo $CARGO_TARGET_DIR
cargo install --force holochain \
  --git https://github.com/holochain/holochain.git \
  --rev $REV
cargo install --force dna_util \
  --git https://github.com/holochain/holochain.git \
  --rev $REV
cargo install --force lair_keystore \
  --git https://github.com/holochain/lair.git \
  --rev $LAIR_REV
