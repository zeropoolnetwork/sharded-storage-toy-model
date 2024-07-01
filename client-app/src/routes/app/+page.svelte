<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { initHDWallet, isWalletInitialized, pk } from '$lib';
  import { getLatestBlocks } from '$lib/api';
  import {
    uploadFile,
    faucet,
    getAccount,
    checkStatus,
    SEQUENCER_API_URL,
    NODE_API_URL
  } from '$lib/api';
  import type { Block } from 'zpst-common';

  let files: { name: string; url: string }[] = [];
  let balance = 0;
  let blocks: Block[] = [];

  const handleUpload = async () => {
    let input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (_) => {
      // @ts-ignore
      let files = Array.from(input.files);

      await uploadFile(files[0] as File);
      await update();
    };
    input.click();
  };

  const handleMint = async () => {
    await faucet(0, 100n);
    balance += 100.0;
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
    const account = await getAccount(pk);
    blocks = await getLatestBlocks();
    // files = account.files.map((name: string) => ({
    //   name,
    //   url: `${NODE_API_URL}/files/${name}`
    // }));
    // balance = account.balance;
  }

  let nodeStatus = true;
  let rollupStatus = true;

  let interval: any;
  onMount(async () => {
    interval = setInterval(async () => {
      let status = await checkStatus();
      nodeStatus = status.node;
      rollupStatus = status.rollup;
    }, 1000);
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
          {#if rollupStatus}
            <span class="text-green-500">✅</span>
          {:else}
            <span class="text-red-500">❌</span>
          {/if}
        </p>
        <p class="text-sm text-gray-300">
          Node: {NODE_API_URL}
          {#if nodeStatus}
            <span class="text-green">✅</span>
          {:else}
            <span class="text-red"> ❌ </span>
          {/if}
        </p>
      </div>
    </div>
    <div class="mb-4">
      <div class="mb-4">
        <p class="text-sm text-gray-600 overflow-hidden">Address: {'FIXME'}</p>
      </div>
      <div class="flex flex-row items-baseline space-x-2">
        <span class="text-sm text-gray-600">Balance: {balance}</span>
        <button
          on:click={handleMint}
          class="bg-yellow-400 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded"
        >
          Faucet
        </button>
      </div>
    </div>
    <div class="border-t pt-4">
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
    <div class="border-t pt-4">
      <h2 class="text-xl font-bold mb-2">Blocks</h2>

      <div class="flex items-center mb-2">
        {#each blocks as block}
          <div class="p-4 max-w-sm mx-auto bg-white rounded-xl shadow-md space-y-2 sm:p-6">
            <div class="text-gray-900 font-bold text-xl mb-2">Block #{block.height}</div>
            <a href={txLink(block.txHash)} target="_blank" class="text-blue-500 overflow-hidden">
              {block.txHash}
            </a>
          </div>
        {/each}
      </div>
    </div>
  {:catch error}
    <p>Error: {error.message}</p>
  {/await}
</div>
