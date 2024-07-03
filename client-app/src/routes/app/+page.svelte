<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { initHDWallet, isWalletInitialized, pk } from '$lib';
  import { getLatestBlocks, listFiles } from '$lib/api';
  import {
    uploadFile,
    faucet,
    getAccount,
    checkStatus,
    SEQUENCER_API_URL,
    NODE_API_URL
  } from '$lib/api';
  import { type Block } from 'zpst-common/src/api';

  let files: { name: string; url: string }[] = [];
  let balance = 0n;
  let blocks: Block[] = [];

  const handleUpload = async () => {
    let input = document.createElement('input');
    input.type = 'file';
    input.multiple = false;
    input.onchange = async (_) => {
      // @ts-ignore
      let files = Array.from(input.files);
      await uploadFile(files[0] as File);
    };
    input.click();
  };

  const handleFaucet = async () => {
    let { index, account } = await faucet();
    balance = BigInt(account.balance);
  };

  async function load() {
    if (isWalletInitialized()) {
      await update();
    } else {
      return goto('/init');
    }
  }

  // TODO: Proper state management
  async function update() {
    try {
      const account = await getAccount(pk);
      console.log(account);
      balance = BigInt(account.account.balance);
    } catch (e) {
      balance = 0n;
    }
  }

  let status: { rollup: boolean; node: boolean; blockInProgress: boolean } = {
    rollup: false,
    node: false,
    blockInProgress: false
  };

  let interval: any;
  onMount(async () => {
    interval = setInterval(async () => {
      status = await checkStatus();
      blocks = await getLatestBlocks();
      files = (await listFiles()).map((meta) => ({
        name: meta.filePath,
        url: `${NODE_API_URL}/files/${meta.filePath}`
      }));
    }, 3000);
  });

  onDestroy(() => {
    clearInterval(interval);
  });

  let promise = load();

  function txLink(tx: string) {
    return `https://sepolia.etherscan.io/tx/${tx}`;
  }
</script>

<div class="border rounded-lg p-4 w-full sm:w-2/3 md:w-1/2 lg:w-1/3">
  {#await promise}
    <p>Loading...</p>
  {:then}
    <div class="mb-4">
      <div class="flex justify-between">
        <p class="text-sm text-gray-300">
          Sequencer: {SEQUENCER_API_URL}
          {#if status.rollup}
            <span class="text-green-500">✅</span>
          {:else}
            <span class="text-red-500">❌</span>
          {/if}
        </p>
        <p class="text-sm text-gray-300">
          Node: {NODE_API_URL}
          {#if status.node}
            <span class="text-green">✅</span>
          {:else}
            <span class="text-red"> ❌ </span>
          {/if}
        </p>
      </div>
    </div>
    <div class="flex">
      <div class="pt-4 grow">
        <h2 class="text-xl font-bold mb-2">Files</h2>
        <button
          on:click={handleUpload}
          class="bg-yellow-400 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded mb-2"
        >
          Upload
        </button>
        {#each files as file}
          <div class="flex items-center mb-2">
            <img src={file.url} alt={file.name} class="w-12 h-12 mr-2 rounded" />
            <a href={file.url} target="_blank" class="text-blue-500 overflow-hidden">{file.name}</a>
          </div>
        {/each}
      </div>
      <div class="border-l p-4">
        <h2 class="text-xl font-bold mb-2">Account</h2>
        <div class="flex items-center mb-2">
          <!-- <div class="text-l text-gray-600 overflow-hidden">Address: {pk}</div> -->
          <div class="text-l text-gray-600 mr-2">Balance: {balance}</div>
          <button
            on:click={handleFaucet}
            class="bg-yellow-400 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded"
          >
            Faucet
          </button>
        </div>
      </div>
    </div>
    <div class="border-t pt-4">
      <h2 class="text-xl font-bold mb-2">Blocks</h2>
      <div class="flex items-center mb-2">
        {#each blocks as block}
          <div
            class="p-4 max-w-sm mx-auto bg-white rounded-xl shadow-md space-y-2 sm:p-6 flex-grow-0"
          >
            <div class="text-gray-900 font-bold text-xl mb-2">Block #{block.height}</div>
            {#if block.height > 0}
              <div class="text-sm text-gray-600">Now: {block.now}</div>
              <div class="overflow-hidden">
                <a
                  href={txLink(block.txHash)}
                  target="_blank"
                  class="text-sm text-blue-500 overflow-hidden"
                >
                  {block.txHash}
                </a>
              </div>
            {:else}
              <div class="text-sm text-gray-600">Genesis</div>
            {/if}
          </div>
        {/each}
        {#if status.blockInProgress}
          <div class="p-4 max-w-sm mx-auto bg-white rounded-xl shadow-md space-y-2 sm:p-6">
            <div class="text-gray-900 font-bold text-xl mb-2">
              Block #{blocks[blocks.length - 1]?.height ?? 0 + 1}
            </div>
            <div class="text-sm text-gray-600">In progress...</div>
          </div>
        {/if}
      </div>
    </div>
  {:catch error}
    <p>Error: {error.message}</p>
  {/await}
</div>
