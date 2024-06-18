// This module implements a non-sparse, severely limited in size Merkle tree

import { MerkleProof as NoirMerkleProof } from "./noir_codegen/index.js"; 
import { frToNoir, Fr, noirToFr } from './util';

import { merkle_tree, poseidon2_bn256_hash, merkle_branch } from '../poseidon2-merkle-tree/pkg/poseidon2_merkle_tree'

export type MerkleProof = [Boolean, Fr][];

export function proof_to_noir(prf: MerkleProof): NoirMerkleProof {
  // Noir code uses little-endian (LSB) for some reason
  return {
    index_bits: prf.map(([i, h]) => Number(i)).reverse(),
    hash_path: prf.map(([i, h]) => frToNoir(h)).reverse(),
  } as NoirMerkleProof;
}

export class Tree<T> {
  depth: number = 0;
  nodes: Fr[] = [];
  values: T[] = [];
  hash_cb: (x: T) => Fr;

  private constructor (depth: number, nodes: Fr[], values: T[], hash_cb: (x: T) => Fr) {
    this.depth = depth;
    this.nodes = nodes;
    this.values = values;
    this.hash_cb = hash_cb;
  }

  static node_hash(left: Fr, right: Fr): Fr {
    return noirToFr(poseidon2_bn256_hash([left, right].map(frToNoir)));
  }

  // Creates a new tree of given depth. If given leaves do not fill up all the
  // available ones, pads the remaining ones with zeroes
  static init<T>(
    depth: number,
    values: T[],
    hash_cb: (x: T) => Fr,
  ): Tree<T> {
    if (values.length != 1 << depth)
      throw new Error("incorrect number of values");

    const nodes = merkle_tree(depth, values.map((x, i, ar) => frToNoir(hash_cb(x))), "0")
      .map(noirToFr);

    return new Tree(depth, nodes, values, hash_cb);
  }

  root(): Fr {
    return this.nodes[1];
  }

  readLeaf(i: number): [MerkleProof, T] {
    let node = i + (1 << this.depth);
    let prf: MerkleProof = [];
    while (node > 1) {
      const parent = node >> 1;
      const sibling = node ^ 1;
      const turn = (node & 1) == 1;
      prf.unshift([turn, this.nodes[sibling]]);
      node = parent;
    }
    return [prf, this.values[i]];
  }

  updateLeaf(i: number, x: T) {
    let node = i + (1 << this.depth);
    this.values[i] = x;
    this.nodes[node] = this.hash_cb(x);
    node = node >> 1;
    // const branch = merkle_branch
    while (node >= 1) {
      const left_child = node << 1;
      const right_child = left_child ^ 1;
      this.nodes[node] = Tree.node_hash(
        this.nodes[left_child],
        this.nodes[right_child]
      );
      node = node >> 1;
    }
  }

};
