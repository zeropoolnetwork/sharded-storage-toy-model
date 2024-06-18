mod utils;
mod parameters;
mod sponge;

use wasm_bindgen::prelude::*;

use std::convert::TryFrom;
use std::sync::Arc;
use core::str::FromStr;

use ark_ff::fields::PrimeField;
use num_bigint::BigUint;

use sponge::Poseidon2Hash;

// use ark_bn254::fq::Fq;
use zkhash::fields::bn256::FpBN256;
use zkhash::{
  merkle_tree::merkle_tree_fp::MerkleTreeHash,
  poseidon2::{
    poseidon2::Poseidon2,
    // poseidon2_instance_bn256::POSEIDON2_BN256_PARAMS,
  },
};

use parameters::POSEIDON2_BN256_PARAMS;

pub type F = FpBN256;
pub type FEnc = String;

pub fn encode_f(x: F) -> FEnc {
  BigUint::from(x.into_bigint()).to_str_radix(10)
}

pub fn decode_f(x: FEnc) -> F {
  F::try_from(BigUint::from_str(&x).unwrap()).unwrap()
}

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub fn greet() {
    alert("Hello, poseidon2-merkle-tree!");
}

#[wasm_bindgen]
pub fn poseidon2_bn256_hash(vals: Vec<FEnc>) -> FEnc {
  let acc : Vec<_> = vals.into_iter().map(decode_f).collect();
  let res = poseidon2_bn256_internal(acc.as_slice());
  encode_f(res)
}

pub fn poseidon2_bn256_internal(vals: &[F]) -> F {
  Poseidon2Hash::hash(&POSEIDON2_BN256_PARAMS, vals, false)
}

#[test]
fn poseidon2test() {
    // H(3, 4) = 17380952042446168291178743041044530828369674063485643659763567652647121881611
    let v: Vec<_> = vec!["3", "4"].into_iter().map(|x| String::from(x)).collect();
    assert_eq!(
      "17380952042446168291178743041044530828369674063485643659763567652647121881611",
      poseidon2_bn256_hash(v),
    );
}
