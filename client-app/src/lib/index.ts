// place files you want to import through the `$lib` alias in this folder.
import { encodeData, decodeData } from 'zpst-common';
import { ethers, Wallet, JsonRpcProvider, BrowserProvider, hashMessage } from 'ethers';
import type { JsonRpcApiProvider, HDNodeWallet } from 'ethers';
import { createWeb3Modal, defaultConfig } from '@web3modal/ethers';
import { Fr } from 'zpst-common';
import { browser } from '$app/environment';
import { poseidon2_bn256_hash } from 'zpst-poseidon2-bn256';

// TODO: Get rid of global variables
// let wallet: Wallet;
let provider: JsonRpcApiProvider;
let signer: ethers.Signer;
let address: string;
export let sk: any;
export async function initHDWallet(mnemonic: string) {
  if (signer) {
    return;
  }

  const p = new JsonRpcProvider('https://rpc.sepolia.org', 'sepolia');
  const wallet = Wallet.fromPhrase(mnemonic).connect(p);
  console.log('Wallet:', wallet.address);

  signer = wallet;
  address = wallet.address;
}

export async function initWeb3Modal() {
  const projectId = 'c1cf0f4b00e964f447d1b1d6c98cab28';

  const testnet = {
    chainId: 11155111,
    name: 'Sepolia',
    currency: 'ETH',
    explorerUrl: 'https://sepolia.etherscan.io',
    rpcUrl: 'https://rpc2.sepolia.org'
  };

  const metadata = {
    name: 'insideout.codes dev',
    description: 'Web3Modal',
    url: 'https://insideout.codes',
    icons: ['https://avatars.githubusercontent.com/u/37784886']
  };

  const ethersConfig = defaultConfig({ metadata });

  const modal = createWeb3Modal({
    ethersConfig,
    chains: [testnet],
    projectId,
  });

  await modal.open();

  const p = modal.getWalletProvider();
  if (!p) {
    throw new Error('Provider is not initialized');
  }

  provider = new BrowserProvider(p);
  signer = await provider.getSigner();
  address = await signer.getAddress();

  const FIXED_MESSAGE: string = 'zpst'; // FIXME
  const sig = (await signer.signMessage(FIXED_MESSAGE)).replace(/^0x/i, '').substring(0, 128);
  const sigHash = hashMessage(sig);

  sk = Fr.fromBufferReduce(Buffer.from(sigHash.replace(/^0x/i, ''), 'hex'));
}

export function isWalletInitialized() {
  return !!sk;
}

