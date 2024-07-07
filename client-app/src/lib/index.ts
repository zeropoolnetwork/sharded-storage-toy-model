//@ts-ignore
BigInt.prototype['toJSON'] = function () {
  return this.toString();
}


// place files you want to import through the `$lib` alias in this folder.
import { ethers, Wallet, JsonRpcProvider, BrowserProvider, hashMessage } from 'ethers';
import type { JsonRpcApiProvider, HDNodeWallet } from 'ethers';
import { createWeb3Modal, defaultConfig, type Web3Modal } from '@web3modal/ethers';
import { Fr } from 'zpst-common/src/fields';
import { derivePublicKey, deriveSecretScalar } from '@zk-kit/eddsa-poseidon';

// TODO: Get rid of global variables

export let sk: bigint;
export let pk: bigint;
let modal: Web3Modal;
export let modalInProgress: boolean = false;

export async function initHDWallet(mnemonic: string) {
  // const p = new JsonRpcProvider('https://rpc.sepolia.org', 'sepolia');
  const wallet = Wallet.fromPhrase(mnemonic);

  sk = deriveSecretScalar(Buffer.from(wallet.privateKey.replace(/^0x/i, ''), 'hex')) % Fr.MODULUS;
  // skBuf = Buffer.from(sk.toString(16).padStart(64, '0'), 'hex');
  pk = derivePublicKey(sk.toString())[0];
  // pkBuf = Buffer.from(pk.toString(16).padStart(64, '0'), 'hex');
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

  modalInProgress = true;

  const p = modal.getWalletProvider();
  if (!p) {
    return;
  }

  const provider = new BrowserProvider(p);
  const signer = await provider.getSigner();

  const FIXED_MESSAGE: string = '{}'; // FIXME
  const sig = (await signer.signMessage(FIXED_MESSAGE)).replace(/^0x/i, '').substring(0, 128);
  const sigHash = hashMessage(sig);

  await modal.close();

  sk = (deriveSecretScalar(sigHash) % Fr.MODULUS);
  pk = derivePublicKey(sk.toString())[0];
}

export function isWalletInitialized() {
  return !!sk;
}

