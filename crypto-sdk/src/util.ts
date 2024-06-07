import { Barretenberg, Fr } from '@aztec/bb.js';
import { Field as NoirFr, RollupPubInput } from "./noir_codegen/index"; 
import { ShardedStorageSettings } from './settings';
import { keccak256 } from '@noir-lang/noir_js'; 

export interface Hashable {
  hash(bb: Barretenberg): Promise<Fr>;
}

export class FrHashed extends Fr implements Hashable {
  async hash(_: Barretenberg): Promise<Fr> {
    return this;
  }

  constructor(x: Fr) {
    super(frToBigInt(x))
  }
}

export function frToBigInt(x: Fr): bigint {
  const s = x.toString();
  const res = BigInt(s.slice(0,2) + '0' + s.slice(2));
  return res;
}

export function bigIntToFr(x: bigint): Fr {
  const res = new Fr(x % Fr.MODULUS);
  return res;
}

export function frToNoir(x: Fr): NoirFr {
  return frToBigInt(x).toString();
}

export function noirToFr(x: NoirFr): Fr {
  return bigIntToFr(BigInt(x));
}

// Generated using Claude AI from Noir circuit definintion
export function pub_input_hash(sett: ShardedStorageSettings, input: RollupPubInput): FrHashed {
  const payload: bigint[] = new Array(sett.pub_len).fill(BigInt(0));
  payload[0] = BigInt(input.old_root);
  payload[1] = BigInt(input.new_root);
  payload[2] = BigInt(input.now);
  payload[3] = BigInt(input.oracle.offset);
  for (let i = 0; i < sett.oracle_len; i++) {
    payload[4 + i] = BigInt(input.oracle.data[i]);
  }

  const u8_pub_len = 32 * sett.pub_len;
  const bytesPayload = new Uint8Array(u8_pub_len);

  for (let i = 0; i < sett.pub_len; i++) {
    // use BE for Ethereum compatibility
    const bytes = bigIntToBytes(payload[i], 32);
    for (let j = 0; j < 32; j++) {
      bytesPayload[i * 32 + j] = bytes[j];
    }
  }

  const res = keccak256(bytesPayload);

  let acc = BigInt(0);

  // use BE for Ethereum compatibility
  for (let i = 0; i < 32; i++) {
    acc = acc * BigInt(256) + BigInt(res[i]);
  }

  return new FrHashed(bigIntToFr(acc));
}

// Helper function to convert bigint to byte array
function bigIntToBytes(value: bigint, length: number): number[] {
  const hex = value.toString(16).padStart(length * 2, '0');
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes.reverse(); // use BE for Ethereum compatibility
}

export function frAdd(x: Fr, y: Fr): Fr {
  return bigIntToFr(frToBigInt(x) + frToBigInt(y))
}
