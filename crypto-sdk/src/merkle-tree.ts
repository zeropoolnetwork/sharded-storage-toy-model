// This module implements a non-sparse, severely limited in size Merkle tree

import { MerkleProof as NoirMerkleProof } from "./noir_codegen/index.js"; 
import { Barretenberg, Fr } from '@aztec/bb.js';

// A function to hash values of type T. Gives you any flexibility you want,
// e.g. you can encode a Barretenberg instance inside it if you want
export type Hasher<T> = (x: T) => Promise<Fr>;

export type Tree<T> = {
  // Function used to hash the leaves
  hash_leaf: Hasher<T>,
  hash_node: Hasher<[Fr, Fr]>,
  depth: number,
  nodes: Fr[],
  values: T[],
};

// Creates a new tree of given depth. If given leaves do not fill up all the
// available ones, pads the remaining ones with zeroes
export async function newTree<T>(
  hash_leaf: Hasher<T>,
  hash_node: Hasher<[Fr, Fr]>,
  depth: number,
  values: T[]
): Promise<Tree<T>> {
  if (values.length != 1 << depth)
    throw new Error("incorrect number of values");
  const hashes = await Promise.all(values.map(hash_leaf));
  if (depth == 0) {
    return {
      hash_leaf: hash_leaf,
      hash_node: hash_node,
      depth: depth,
      nodes: [Fr.ZERO, ...hashes], // 0th element is not used
      values: values
    };
  } else {
    const acc = Array.from({ length: hashes.length / 2 },
      (_, i) => hash_node([hashes[i*2], hashes[i*2 + 1]])
    );
    const levelAbove = await Promise.all(acc);
    const parents = await newTree<Fr>(async (x) => x, hash_node, depth - 1, levelAbove);
    return {
      depth: depth,
      hash_leaf: hash_leaf,
      hash_node: hash_node,
      nodes: [...parents.nodes, ...hashes],
      values: values
    };
  }
}

export type MerkleProof = [0 | 1, Fr][];

export function root<T>(t: Tree<T>): Fr {
  return t.nodes[1];
}

export function readLeaf<T>(t: Tree<T>, i: number): [MerkleProof, T] {
  let node = i + (1 << t.depth);
  let prf: MerkleProof = [];
  while (node > 1) {
    const parent = node >> 1;
    const sibling = node ^ 1;
    const turn = node & 1;
    prf.unshift([(1 ^ turn) as (0 | 1), t.nodes[sibling]]);
    node = parent;
  }
  return [prf, t.values[i]];
}

export async function updateLeaf<T>(t: Tree<T>, i: number, x: T): Promise<void> {
  let node = i + (1 << t.depth);
  t.values[i] = x;
  t.nodes[node] = await t.hash_leaf(x);
  node = node >> 1;
  while (node >= 1) {
    const left_child = node << 1;
    const right_child = left_child ^ 1;
    t.nodes[node] = await t.hash_node([t.nodes[left_child], t.nodes[left_child]]);
  }
}
