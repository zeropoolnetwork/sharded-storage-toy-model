import { Barretenberg, Fr } from '@aztec/bb.js';
import { Tree } from './../src/merkle-tree';
import { bigIntToFr, frAdd, frToBigInt, FrHashed } from '../src/util';
import { cpus } from 'os';

describe('Merkle Tree', () => {

  test('creates a new tree with correct depth and values', async () => {
    let bb = await Barretenberg.new({ threads: cpus().length });
    const values = [1n, 2n, 3n, 4n].map((x) => new FrHashed(bigIntToFr(x)));
    const depth = 2;
    const tree = await Tree.init(bb, depth, values);

    expect(tree.depth).toBe(depth);
    expect(tree.values).toEqual(values);
    expect(tree.nodes.length).toBe(2 ** (depth + 1));

    let exp_nodes = [0n, 0n, 0n, 0n, 1n, 2n, 3n, 4n];
    for (let i = (2 ** depth) - 1; i >= 1; --i)
      exp_nodes[i] = frToBigInt(await bb.poseidon2Hash([
        bigIntToFr(exp_nodes[i*2]),
        bigIntToFr(exp_nodes[i*2 + 1])
      ]));

    const test_nodes = tree.nodes.map(frToBigInt);
    expect(test_nodes).toEqual(exp_nodes);

    bb.destroy();
  });

  test('throws an error when creating a tree with incorrect number of values', async () => {
    let bb = await Barretenberg.new({ threads: cpus().length });
    const values = [0n, 0n, 0n].map((i) => new FrHashed(bigIntToFr(i)));
    const depth = 2;

    await expect(Tree.init(bb, depth, values)).rejects.toThrow();

    bb.destroy();
  });

  test('Read and update Merkle tree leaf', async () => {
    let bb = await Barretenberg.new({ threads: cpus().length });
    const values = [1n, 2n, 3n, 4n].map((i) => new FrHashed(bigIntToFr(i)));
    const depth = 2;
    const tree = await Tree.init(
      bb,
      depth,
      values
    );

    const [two_proof, two] = tree.readLeaf(1);
    expect(frToBigInt(two)).toEqual(2n);
    expect(two_proof).toEqual([
      [false, await bb.poseidon2Hash([bigIntToFr(3n), bigIntToFr(4n)])],
      [true, bigIntToFr(1n)]
    ]);
    expect(two_proof.length).toBe(depth);

    await tree.updateLeaf(1, new FrHashed(bigIntToFr(10n)));
    const [ten_proof, ten] = tree.readLeaf(1);
    expect(frToBigInt(ten)).toEqual(10n);
    expect(ten_proof).toEqual(two_proof);

    bb.destroy();
  });
});
