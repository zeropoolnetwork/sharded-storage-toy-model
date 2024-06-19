mod utils;
mod parameters;
mod sponge;

use wasm_bindgen::{prelude::*};

use std::convert::TryFrom;


use core::str::FromStr;

use ark_ff::fields::PrimeField;
use num_bigint::BigUint;

use sponge::Poseidon2Hash;

// use ark_bn254::fq::Fq;
use zkhash::fields::bn256::FpBN256;


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
/// Version of [[poseidon2_bn256_internal]] that can be called from TS
///
/// ```
/// use zpst_poseidon2_bn256::poseidon2_bn256_hash;
///
/// assert_eq!(poseidon2_bn256_hash(vec!["0".to_string()]),
///   "17668610518173883319035856328661308815933580113901672897605691629848497347345".to_string());
/// assert_eq!(poseidon2_bn256_hash(vec!["1".to_string()]),
///   "10190015755989328289879378487807721086446093622177241109507523918927702106995".to_string());
/// ```
pub fn poseidon2_bn256_hash(vals: Vec<FEnc>) -> FEnc {
  let acc : Vec<_> = vals.into_iter().map(decode_f).collect();
  let res = poseidon2_bn256_internal(acc.as_slice());
  encode_f(res)
}

#[wasm_bindgen]
/// `proof_path` is actually booleans, but encoded as numbers.
///
/// The test below uses the same tree as in [[merkle_tree]].
///
/// ```
/// use zpst_poseidon2_bn256::merkle_branch;
///
/// assert_eq!(
///   merkle_branch("2".to_string(), vec![0, 1], vec![
///     "17380952042446168291178743041044530828369674063485643659763567652647121881611".to_string(),
///     "1".to_string(),
///     ]),
///   vec![
///     "18145963038378645805713504092197197549342394757429773105454438568839292866655".to_string(),
///     "1594597865669602199208529098208508950092942746041644072252494753744672355203".to_string(),
///   ],
/// )
/// ```

pub fn merkle_branch(leaf: FEnc, proof_path: Vec<usize>, proof: Vec<FEnc>) -> Vec<FEnc> {
  let conv: Vec<_> = proof_path.iter().zip(proof.iter()).map(
    |(&dir, val)| (dir != 0usize, decode_f(val.clone()))
  ).collect();
  let res = merkle_branch_internal(decode_f(leaf), conv.as_slice());
  res.into_iter().map(encode_f).collect()
}

#[wasm_bindgen]
/// ```
/// use zpst_poseidon2_bn256::merkle_tree;
///
/// assert_eq!(
///   merkle_tree(2, vec!["1", "2", "3", "4"].into_iter().map(|x| x.to_string()).collect(), "1000000".to_string()),
///   vec![
///   "0", // not used, always 0
///   "18145963038378645805713504092197197549342394757429773105454438568839292866655", // root = H(H(1, 2), H(3,4))
///   "1594597865669602199208529098208508950092942746041644072252494753744672355203", // H(1, 2)
///   "17380952042446168291178743041044530828369674063485643659763567652647121881611", // H(3, 4)
///   "1", // the rest are the leaves with values in them
///   "2",
///   "3",
///   "4"].into_iter().map(|x| x.to_string()).collect::<Vec<String>>()
/// )
pub fn merkle_tree(depth: usize, values: Vec<FEnc>, def: FEnc) -> Vec<FEnc> {
  let conv_values: Vec<_> = values.iter().cloned().map(decode_f).collect();
  merkle_tree_internal(depth, conv_values.as_slice(), decode_f(def))
    .into_iter().map(encode_f).collect()
}

/// Computes Poseidon2 hash of a sequence of values
pub fn poseidon2_bn256_internal(vals: &[F]) -> F {
  Poseidon2Hash::hash(&POSEIDON2_BN256_PARAMS, vals, false)
}

fn tree_node_hash(left: F, right: F) -> F {
  poseidon2_bn256_internal(&[left, right])
}

/// Computes hashes along a path from root to leaf by given Merkle proof and leaf value
pub fn merkle_branch_internal(leaf: F, proof: &[(bool, F)]) -> Vec<F> {
  let mut acc = leaf;
  let res: Vec<_> = proof.iter().rev().map(
    |&(dir, val)| {
      acc = if dir {
        tree_node_hash(val, acc)
      } else {
        tree_node_hash(acc, val)
      };
      acc
    }
  ).collect();
  res.into_iter().rev().collect()
}

/// Computes the whole merkle tree of given depth for given list of leaves.
pub fn merkle_tree_internal(depth: usize, values: &[F], def: F) -> Vec<F> {
  let nodes_len = 1usize << (depth + 1);
  let inner_nodes_len = 1usize << depth;
  let mut nodes = vec![F::from(0u64); nodes_len];

  for node in (1..nodes_len).rev() {
    nodes[node] = if node >= inner_nodes_len {
      let val_index = node - inner_nodes_len;
      if val_index < values.len() {
        values[val_index]
      } else {
        def
      }
    } else {
      let left_child = node << 1;
      let right_child = left_child ^ 1;
      tree_node_hash(nodes[left_child], nodes[right_child])
    }
  }

  nodes
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
