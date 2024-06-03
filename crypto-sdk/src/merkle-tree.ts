// This module implements a non-sparse, severely limited in size Merkle tree

import { MerkleProof as NoirMerkleProof } from "./noir_codegen/index.js"; 
import { Barretenberg, Fr } from '@aztec/bb.js';
import { Hashable } from './util.js';

export type MerkleProof = [Boolean, Fr][];

export class Tree<T extends Hashable> implements Hashable {
  bb: Barretenberg;
  depth: number = 0;
  nodes: Fr[] = [];
  values: T[] = [];

  private constructor (bb: Barretenberg, depth: number, nodes: Fr[], values: T[]) {
    this.bb = bb;
    this.depth = depth;
    this.nodes = nodes;
    this.values = values;
  }

  static node_hash(bb: Barretenberg, left: Fr, right: Fr): Promise<Fr> {
    return bb.poseidon2Hash([left, right]);
  }

  // Creates a new tree of given depth. If given leaves do not fill up all the
  // available ones, pads the remaining ones with zeroes
  static async init<T extends Hashable>(
    bb: Barretenberg,
    depth: number,
    values: T[]
  ): Promise<Tree<T>> {
    if (values.length != 1 << depth)
      throw new Error("incorrect number of values");

    const ps = new Array(1 << (depth + 1));
    ps[0] = Promise.resolve(Fr.ZERO);
    for (let node_i = ps.length - 1; node_i >= 1; --node_i) {
      if (node_i >= (1 << depth)) {
        // leaf
        const leaf_i = node_i - (1 << depth);
        ps[node_i] = values[leaf_i].hash(bb);
      } else {
        // inner node
        ps[node_i] = Tree.node_hash(bb,
          await ps[node_i * 2],
          await ps[node_i * 2 + 1],
        );
      }
    }

    return new Tree(bb, depth, await Promise.all(ps), values);
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

  async updateLeaf(i: number, x: T): Promise<void> {
    let node = i + (1 << this.depth);
    this.values[i] = x;
    this.nodes[node] = await x.hash(this.bb);
    node = node >> 1;
    while (node >= 1) {
      const left_child = node << 1;
      const right_child = left_child ^ 1;
      this.nodes[node] = await Tree.node_hash(this.bb,
        this.nodes[left_child],
        this.nodes[right_child]
      );
    }
  }

  async hash(_: Barretenberg): Promise<Fr> {
    return this.root();
  }

};
