import { Tree } from './../src/merkle-tree';
import { bigIntToFr, frAdd, Fr, fr_serialize, fr_deserialize } from '../src/util';
import { cpus } from 'os';
import { poseidon2_bn256_hash } from 'zpst-poseidon2-bn256';

function id<T>(x: T): T { return x }

describe('Merkle Tree', () => {

  test('creates a new tree with correct depth and values', async () => {
    const values = [1n, 2n, 3n, 4n];
    const depth = 2;
    const tree = await Tree.init(depth, values, 0n, id);

    expect(tree.depth).toBe(depth);
    expect(tree.values).toEqual(values);
    expect(tree.nodes.length).toBe(2 ** (depth + 1));


    let exp_nodes = [0n, 0n, 0n, 0n, 1n, 2n, 3n, 4n];
    for (let i = (2 ** depth) - 1; i >= 1; --i)
      exp_nodes[i] = fr_deserialize(poseidon2_bn256_hash([
        fr_serialize(exp_nodes[i*2]),
        fr_serialize(exp_nodes[i*2 + 1])
      ]));

    expect(tree.nodes).toEqual(exp_nodes);
  });

  test('pad leaves when fewer values were provided', async () => {
    expect(
      Tree.init(2, [0n, 0n, 0n], 1n, id)
    ).toEqual(
      Tree.init(2, [0n, 0n, 0n, 1n], 0n, id)
    );
  });


  test('throw an exception when too many leaves were provided', async () => {
    await expect(async () => Tree.init(2, [0n, 1n, 2n, 3n, 4n], 0n, id)).rejects.toThrow();
  });


  test('Compute Poseidon2 hash with WASM', async () => {

    expect(fr_deserialize(poseidon2_bn256_hash([fr_serialize(0n)])))
      .toEqual(17668610518173883319035856328661308815933580113901672897605691629848497347345n);
    expect(fr_deserialize(poseidon2_bn256_hash([fr_serialize(1n)])))
      .toEqual(10190015755989328289879378487807721086446093622177241109507523918927702106995n);
  });

  test('Read and update Merkle tree leaf', async () => {
    const values = [1n, 2n, 3n];
    const depth = 2;
    const tree = await Tree.init(depth, values, 4n, id);


    expect(tree.nodes).toEqual(
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
    expect(two).toEqual(2n);
    expect(two_proof).toEqual([
      [false, fr_deserialize(poseidon2_bn256_hash([fr_serialize(3n), fr_serialize(4n)]))],
      [true, 1n]
    ]);
    expect(two_proof.length).toBe(depth);


    await tree.updateLeaf(1, 10n);
    const [ten_proof, ten] = tree.readLeaf(1);
    expect(ten).toEqual(10n);

    expect(ten_proof).toEqual(two_proof);
  });
});
