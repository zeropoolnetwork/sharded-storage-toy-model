//! Test suite for the Web and headless browsers.

#![cfg(target_arch = "wasm32")]

extern crate wasm_bindgen_test;
use wasm_bindgen_test::*;
// use poseidon2_bn256_hash::poseidon2;

wasm_bindgen_test_configure!(run_in_browser);
