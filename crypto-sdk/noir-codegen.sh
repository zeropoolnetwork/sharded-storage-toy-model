#/bin/sh -efu

json="../circuits/target/circuits.json"
out_dir="./src/noir_codegen/"
ts="src/noir_codegen/index.ts"

set -x

noir-codegen "$json" --out-dir "$out_dir"
sed -i $'1i\\\n// @ts-nocheck' "$ts"
sed -i '/^export const circuits_circuit/,$d' "$ts"
