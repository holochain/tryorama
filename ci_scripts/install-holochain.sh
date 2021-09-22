#!/bin/bash

REV=092df23697b7fdd53f901ec4c3a8579c280bae3f
LAIR_REV=6a9aab37c90566328c13c4d048d1afaf75fc39a9

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
