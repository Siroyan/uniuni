#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v cargo >/dev/null || ! command -v wasm-bindgen >/dev/null; then
  echo "Rust and wasm-bindgen-cli 0.2.114 are required. See README.md." >&2
  exit 1
fi

cargo build --locked --manifest-path "$repo_root/core/Cargo.toml" --target wasm32-unknown-unknown --release
wasm-bindgen --target web --out-dir "$repo_root/web/public/core/pkg" \
  "$repo_root/core/target/wasm32-unknown-unknown/release/uniuni_core.wasm"
