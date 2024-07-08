//@ts-ignore
BigInt.prototype['toJSON'] = function () {
  return this.toString();
}


// place files you want to import through the `$lib` alias in this folder.
import { ethers, Wallet, JsonRpcProvider, BrowserProvider, hashMessage, type Eip1193Provider } from 'ethers';
import type { JsonRpcApiProvider, HDNodeWallet } from 'ethers';
import { createWeb3Modal, defaultConfig, type Web3Modal } from '@web3modal/ethers';
import { Fr } from 'zpst-common/src/fields';
import { derivePublicKey, deriveSecretScalar } from '@zk-kit/eddsa-poseidon';
import { type Writable, writable } from 'svelte/store';

// TODO: Get rid of global variables

export let sk: bigint;
export let pk: bigint;
export let initialized: Writable<boolean> = writable(false);
let modal: Web3Modal;

export async function initHDWallet(mnemonic: string) {
  // const p = new JsonRpcProvider('https://rpc.sepolia.org', 'sepolia');
  const wallet = Wallet.fromPhrase(mnemonic);

  sk = deriveSecretScalar(Buffer.from(wallet.privateKey.replace(/^0x/i, ''), 'hex')) % Fr.MODULUS;
  // skBuf = Buffer.from(sk.toString(16).padStart(64, '0'), 'hex');
  pk = derivePublicKey(sk.toString())[0];
  // pkBuf = Buffer.from(pk.toString(16).padStart(64, '0'), 'hex');

  initialized.set(true);
}

export async function initWeb3Modal() {
  if (!modal) {
    const projectId = 'c1cf0f4b00e964f447d1b1d6c98cab28';

    const testnet = {
      chainId: 11155111,
      name: 'Sepolia',
      currency: 'ETH',
      explorerUrl: 'https://sepolia.etherscan.io',
      rpcUrl: 'https://sepolia.drpc.org'
    };

    const metadata = {
      name: 'client.storage.zeropool.network dev',
      description: 'Web3Modal',
      url: 'https://storage.zeropool.network',
      icons: ['https://avatars.githubusercontent.com/u/37784886']
    };

    const ethersConfig = defaultConfig({ metadata });
    modal = createWeb3Modal({
      ethersConfig,
      chains: [testnet],
      projectId,
      defaultChain: testnet,
    });
  }

  await modal.open();

  await new Promise((resolve) => {
    let interval = setInterval(async () => {
      if (modal.getIsConnected()) {
        clearInterval(interval);
        resolve(undefined);
      }
    });
  });

  const p: Eip1193Provider = await new Promise(async (resolve) => {
    async function init() {
      const p = modal.getWalletProvider();
      if (!p) {
        setTimeout(init, 200);
        return;
      }

      resolve(p);
    }

    await init();
  });

  const provider = new BrowserProvider(p);
  const signer = await provider.getSigner();

  const FIXED_MESSAGE: string = '{}'; // FIXME
  const sig = (await signer.signMessage(FIXED_MESSAGE)).replace(/^0x/i, '').substring(0, 128);
  const sigHash = hashMessage(sig);

  sk = (deriveSecretScalar(sigHash) % Fr.MODULUS);
  pk = derivePublicKey(sk.toString())[0];

  initialized.set(true);

  await modal.close();
}


