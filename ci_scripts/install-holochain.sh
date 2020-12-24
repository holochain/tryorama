#!/bin/bash

REV=60a906212c17ee067b31511e6b2957746d86297b

cargo install --force holochain \
  --git https://github.com/holochain/holochain.git \
  --rev $REV
cargo install --force dna_util \
  --git https://github.com/holochain/holochain.git \
  --rev $REV
cargo install --force lair-keystore \
      --git https://github.com/holochain/lair.git
