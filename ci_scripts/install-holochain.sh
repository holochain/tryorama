#!/bin/bash

REV=a9f1e2d184d6f34f68ccedb2ada26a32649b9970
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
