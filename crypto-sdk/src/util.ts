import { Barretenberg, Fr } from '@aztec/bb.js';

export interface Hashable {
  hash(this: Hashable, bb: Barretenberg): Promise<Fr>;
}

export class FrHashed extends Fr implements Hashable {
  async hash(_: Barretenberg): Promise<Fr> {
    return this;
  }
}

export function frToBigInt(x: Fr): bigint {
  const s = x.toString();
  const res = BigInt(s.slice(0,2) + '0' + s.slice(2));
  return res;
}

export function bigIntToFr(x: bigint): Fr {
  // let s = x.toString(16).padStart(32, '0');
  const res = new Fr(x);
  return res;
}

export function frAdd(x: Fr, y: Fr): Fr {
  return bigIntToFr((frToBigInt(x) + frToBigInt(y)) % Fr.MODULUS)
}
