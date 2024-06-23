import { Fr } from 'zpst-common/src/fields';
import { signMessage } from '@zk-kit/eddsa-poseidon';
import { sk } from '$lib';
// import {
//   derivePublicKey,
//   verifySignature,
//   deriveSecretScalar,
//   packPublicKey,
//   unpackPublicKey,
// } from "@zk-kit/eddsa-poseidon"

export class AccountData {
  /// x coordinate of the owner account public key
  key: Fr = Fr.ZERO;
  /// Balance
  balance: Fr = Fr.ZERO;
  // Nonce
  nonce: Fr = Fr.ZERO;
  // Mining nonce
  random_oracle_nonce: Fr = Fr.ZERO;

  sign() {
    return signMessage(sk.toBuffer(), this.concat());
  }

  concat(): Uint8Array {
    const buf = new Uint8Array(Fr.SIZE_IN_BYTES * 4);
    buf.set(this.key.toBuffer(), 0);
    buf.set(this.balance.toBuffer(), Fr.SIZE_IN_BYTES);
    buf.set(this.nonce.toBuffer(), Fr.SIZE_IN_BYTES * 2);
    buf.set(this.random_oracle_nonce.toBuffer(), Fr.SIZE_IN_BYTES * 3);

    return buf;
  }
}
