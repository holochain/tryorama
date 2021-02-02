#!/bin/bash

REV=9b09d7acba71739ab4bdb26f43cf210d5f298165
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
