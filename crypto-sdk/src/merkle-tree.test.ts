import { Barretenberg, Fr } from '@aztec/bb.js';
import { newTree, root, readLeaf, updateLeaf } from './merkle-tree';
import { bigIntToFr, frAdd, frToBigInt } from './util';
import { cpus } from 'os';


// Mock implementations of hash functions
const mockHashLeaf = async (value: string) => new Fr(BigInt(value));
const mockHashNode = async ([left, right]: [Fr, Fr]) => frAdd(left, right);

// Actual Poseidon2 hash
const poseidon2Leaf = async (bb: Barretenberg, x: Fr) => bb.poseidon2Hash([x]);
const poseidon2Node = async (bb: Barretenberg, [left, right]: [Fr, Fr]) => bb.poseidon2Hash([left, right]);

describe('Merkle Tree', () => {
  test('creates a new tree with correct depth and values', async () => {
    const values = ['1', '20', '300', '4000'];
    const depth = 2;
    const tree = await newTree(mockHashLeaf, mockHashNode, depth, values);

    expect(tree.depth).toBe(depth);
    expect(tree.values).toEqual(values);
    expect(tree.nodes.length).toBe(2 ** (depth + 1));
    const exp_nodes = [0n, 4321n, 21n, 4300n, 1n, 20n, 300n, 4000n];
    const test_nodes = tree.nodes.map(frToBigInt);
    console.log(`test_nodes = ${test_nodes}`);
    console.log(`exp_nodes = ${exp_nodes}`);
    expect(test_nodes).toEqual(exp_nodes);
  });

  test('throws an error when creating a tree with incorrect number of values', async () => {
    const values = ['a', 'b', 'c'];
    const depth = 2;

    await expect(newTree(mockHashLeaf, mockHashNode, depth, values)).rejects.toThrow();
  });

  test('Test Merkle tree with actual poseidon2Hash', async () => {
    let bb = await Barretenberg.new({ threads: cpus().length });
    const values = [1n, 2n, 3n, 4n].map(bigIntToFr);
    const depth = 2;
    const tree = await newTree(
      poseidon2Leaf.bind(null, bb),
      poseidon2Node.bind(null, bb),
      depth,
      values
    );

    const [two_proof, two] = readLeaf(tree, 1);
    expect(frToBigInt(two)).toEqual(2n);
    expect(two_proof.length).toBe(depth);

    updateLeaf(tree, 1, bigIntToFr(10n));
    const [ten_proof, ten] = readLeaf(tree, 1);
    expect(frToBigInt(ten)).toEqual(10n);
    expect(ten_proof).toEqual(two_proof);

    bb.destroy();
  });
});
