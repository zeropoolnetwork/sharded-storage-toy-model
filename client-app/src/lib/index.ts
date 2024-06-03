// place files you want to import through the `$lib` alias in this folder.
import { encodeData, decodeData } from 'zpst-common';
import { ethers, Wallet, JsonRpcProvider, BrowserProvider } from 'ethers';
import type { JsonRpcApiProvider, HDNodeWallet } from 'ethers';
import { createWeb3Modal, defaultConfig } from '@web3modal/ethers'
import { Fr } from 'zpst-common/src/fields';

// let wallet: Wallet;
let provider: JsonRpcApiProvider;
let signer: ethers.Signer;
let address: string;

// export const TEST_MNEMONIC = 'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat';

// export function test() {
//   let data = encodeData(new TextEncoder().encode('hello world'));
//   console.log(data);
// }

export async function initHDWallet(mnemonic?: string) {
  if (signer) {
    return;
  }

  if (!mnemonic) {
    if (localStorage.getItem('mnemonic')) {
      mnemonic = localStorage.getItem('mnemonic')!;
    } else {
      throw new Error('Mnemonic is not provided');
    }
  } else {
    localStorage.setItem('mnemonic', mnemonic); // FIXME: encrypt
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
    name: 'Seplia',
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

  const FIXED_MESSAGE: string = 'insideout.codes';
  const signature = await signer.signMessage(FIXED_MESSAGE);

  // FIXME:
  const sk = Fr.fromBufferReduce(Buffer.from(signature.replace(/^0x/i, ''), 'hex'));
}

export function isWalletInitialized() {
  return !!signer.getAddress();
}

