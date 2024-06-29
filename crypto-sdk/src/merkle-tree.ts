// This module implements a non-sparse, severely limited in size Merkle tree

import { BinaryWriter, BinaryReader } from 'zpst-common/src/binary';
import { MerkleProof as NoirMerkleProof } from "./noir_codegen/index.js";
import { fr_serialize, Fr, fr_deserialize, bigIntToBytes, bigintToBuffer, bufferToBigint, Serde } from './util';

import { merkle_tree, poseidon2_bn256_hash, merkle_branch } from 'zpst-poseidon2-bn256';


export type MerkleProof = [Boolean, Fr][];

export function proof_to_noir(prf: MerkleProof): NoirMerkleProof {
  // Noir code uses little-endian (LSB) for some reason
  return {
    index_bits: prf.map(([i, h]) => Number(i)).reverse(),
    hash_path: prf.map(([i, h]) => fr_serialize(h)).reverse(),
  } as NoirMerkleProof;
}

export class Tree<T> implements Serde {
  depth: number = 0;
  nodes: Fr[] = [];
  values: T[] = [];
  hash_cb: (x: T) => Fr;

  constructor(depth: number, nodes: Fr[], values: T[], hash_cb: (x: T) => Fr) {
    this.depth = depth;
    this.nodes = nodes;
    this.values = values;
    this.hash_cb = hash_cb;
  }

  static node_hash(left: Fr, right: Fr): Fr {
    return fr_deserialize(poseidon2_bn256_hash([left, right].map(fr_serialize)));
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

    const nodes = merkle_tree(depth, values.map((x, i, ar) => fr_serialize(hash_cb(x))), "0")
      .map(fr_deserialize);

    return new Tree(depth, nodes, values, hash_cb);
  }

  root(): Fr {
    return this.nodes[1];
  }

  leaf(i: number): Fr {
    const index = i + (1 << this.depth);
    return this.nodes[index];
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
    const new_leaf = this.hash_cb(x);
    this.nodes[node] = new_leaf;
    const [prf, _] = this.readLeaf(i);
    const proof_path = prf.map(([turn, _]) => Number(turn));
    const proof = prf.map(([_, val]) => val.toString());
    let branch = merkle_branch(
      fr_serialize(new_leaf),
      new Uint32Array(proof_path),
      proof,
    );

    node >>= 1;
    while (node >= 1) {
      const val = branch.pop();
      if (val == undefined)
        throw Error("bad!");
      this.nodes[node] = fr_deserialize(val);
      node = node >> 1;
    }
  }

  clone(): Tree<T> {
    return new Tree(this.depth, this.nodes.slice(), this.values.slice(), this.hash_cb);
  }

  serialize(): Buffer {
    const size = 4 + (1 << (this.depth + 1) + 1 << this.depth) * 32;
    const w = new BinaryWriter(size);

    w.writeU32(this.depth);
    for (const node of this.nodes) {
      w.writeBuffer(bigintToBuffer(node));
    }

    for (const value of this.values) {
      // FIXME: Can't implement Serde for bigint, can't constrain T by Serde OR bigint. Need to fix this.
      if (typeof value === 'bigint') {
        w.writeU256(value);
      } else {
        w.writeBuffer((value as unknown as Serde).serialize());
      }
    }

    return w.toBuffer();
  }

  deserialize(bytes: Buffer, defaultValue: () => T): void {
    const r = new BinaryReader(bytes);
    this.depth = r.readU32();

    for (let i = 0; i < (1 << (this.depth + 1)); i++) {
      this.nodes.push(r.readU256());
    }

    for (let i = 0; i < (1 << this.depth); i++) {
      const value = defaultValue();
      if (typeof value == 'bigint') {
        this.values.push(r.readU256() as unknown as T);
      } else {
        (value as unknown as Serde).deserialize(r.buf.subarray(r.offset));
        this.values.push(value);
      }
    }
  }
};

