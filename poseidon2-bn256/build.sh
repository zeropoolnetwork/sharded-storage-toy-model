#!/usr/bin/env bash

wasm-pack build --target nodejs --out-dir nodejs
wasm-pack build --target bundler --out-dir bundler
