//! Test suite for the Web and headless browsers.

#![cfg(target_arch = "wasm32")]

extern crate wasm_bindgen_test;
use wasm_bindgen_test::*;
use poseidon2_merkle_tree::poseidon2;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn poseidon2test() {
    let v: Vec<_> = vec!["3", "4"].into_iter().map(|x| String::from(x)).collect();
    assert_eq!(
      "17380952042446168291178743041044530828369674063485643659763567652647121881611",
      poseidon2(v),
    );
    // H(3, 4) = 17380952042446168291178743041044530828369674063485643659763567652647121881611
}
