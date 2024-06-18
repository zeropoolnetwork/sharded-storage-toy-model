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


  test('Compute Poseidon2 hash with Barretenberg', async () => {
    let bb = await Barretenberg.new({ threads: cpus().length });

    expect(frToBigInt(await bb.poseidon2Hash([bigIntToFr(0n)])))
      .toEqual(17668610518173883319035856328661308815933580113901672897605691629848497347345n);
    expect(frToBigInt(await bb.poseidon2Hash([bigIntToFr(1n)])))
      .toEqual(10190015755989328289879378487807721086446093622177241109507523918927702106995n);
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

    expect(tree.nodes.map(frToBigInt)).toEqual(
      [
        0n, // not used, always 0
        18145963038378645805713504092197197549342394757429773105454438568839292866655n, // root = H(H(1, 2), H(3,4))
        1594597865669602199208529098208508950092942746041644072252494753744672355203n, // H(1, 2)
        17380952042446168291178743041044530828369674063485643659763567652647121881611n, // H(3, 4)
        1n, // the rest are the leaves with values in them
        2n,
        3n,
        4n,
      ]
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
