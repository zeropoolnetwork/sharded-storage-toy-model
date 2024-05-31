import { Fr } from '@aztec/bb.js';

export function frToBigInt(x: Fr): bigint {
  const s = x.toString();
  const res = BigInt(s.slice(0,2) + '0' + s.slice(2));
  console.log(`frToBigInt: ${x} -> ${res}`);
  return res;
}

export function bigIntToFr(x: bigint): Fr {
  // let s = x.toString(16).padStart(32, '0');
  const res = new Fr(x);
  console.log(`bigIntToFr: ${x} -> ${res}`);
  return res;
}

export function frAdd(x: Fr, y: Fr): Fr {
  return bigIntToFr((frToBigInt(x) + frToBigInt(y)) % Fr.MODULUS)
}
