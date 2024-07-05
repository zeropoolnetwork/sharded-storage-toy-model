<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { isWalletInitialized, pk } from '$lib';
  import {
    uploadFile,
    faucet,
    getLatestBlocks,
    getFiles,
    getAccount,
    checkStatus,
    SEQUENCER_API_URL,
    NODE_API_URL
  } from '$lib/api';
  import { type Block } from 'zpst-common/src/api';

  let files: { name: string; url: string }[] = [];
  let pendingFiles: { name: string }[] = [];
  let balance = 0n;
  let blocks: Block[] = [];

  const handleUpload = async () => {
    let input = document.createElement('input');
    input.type = 'file';
    input.multiple = false;
    input.onchange = async (_) => {
      // @ts-ignore
      let files = Array.from(input.files);
      pendingFiles = [{ name: files[0].name }, ...pendingFiles];
      await uploadFile(files[0] as File);
    };
    input.click();
  };

  const handleFaucet = async () => {
    let { index, account } = await faucet();
    balance = BigInt(account.balance);
  };

  async function load() {
    if (!isWalletInitialized()) {
      return goto('/init');
    }
  }

  let status: { rollup: boolean; node: boolean; blockInProgress: boolean } = {
    rollup: false,
    node: false,
    blockInProgress: false
  };

  let updateInterval: any;
  let promise: Promise<void>;
  onMount(async () => {
    promise = load();
    updateInterval = setInterval(async () => {
      status = await checkStatus();

      const b = await getLatestBlocks();
      if (b.length < 3) {
        b.push({ height: 0, now: 0, txHash: '', oldRoot: '', newRoot: ''});
      }
      blocks = b;

      const account = await getAccount(pk);
      balance = BigInt(account?.account.balance ?? 0n);

      const fetchedFiles = await getFiles();
      files = fetchedFiles.map((meta) => ({
        name: meta.filePath,
        url: `${SEQUENCER_API_URL}/files/${pk}/${meta.filePath}`
      }));

      pendingFiles = pendingFiles.filter(
        (file) => !fetchedFiles.some((meta) => meta.filePath === file.name)
      );
    }, 3000);
  });

  onDestroy(() => {
    clearInterval(updateInterval);
  });

  function txLink(tx: string) {
    return `https://sepolia.etherscan.io/tx/${tx}`;
  }
</script>

<div class="border rounded-lg p-4 w-full sm:w-2/3 md:w-2/3 lg:w-1/2 bg-slate-100">
  {#await promise}
    <p>Loading...</p>
  {:then}
    <div class="flex">
      <div class="grow">
        <div class="flex items-center">
          <h2 class="mb-2 mr-2 font-bold uppercase">Files</h2>
          {#if balance > 0n}
            <button
              on:click={handleUpload}
              class="py-2 px-4 bg-orange-400 hover:bg-orange-500 text-white font-bold rounded mb-2"
            >
              Upload
            </button>
          {/if}
        </div>
        <div class="overflow-y-scroll max-h-64">
          {#each pendingFiles as file}
            <div class="flex items-center mb-2">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 mr-2"></div>
              <div class="text-gray-600">{file.name}</div>
            </div>
          {/each}
          {#each files as file}
            <div class="flex items-center mb-2">
              <!-- <img src={file.url} alt={file.name} class="w-12 h-12 mr-2 rounded" /> -->
              <a href={file.url} target="_blank" class="text-blue-500 overflow-hidden">
                {file.name}
              </a>
            </div>
          {/each}
        </div>
      </div>
      <div class="border-l pl-4">
        <h2 class="mb-2 font-bold uppercase text-center">Account</h2>
        <div class="mb-2 rounded bg-slate-600">
          <!-- <div class="text-l text-gray-600 overflow-hidden">Address: {pk}</div> -->
          <div class="text-l text-gray-100 py-2 px-4 text-center">{balance}</div>
          <button
            on:click={handleFaucet}
            class="w-full py-2 px-4 bg-orange-400 hover:bg-orange-500 border text-white font-bold rounded"
          >
            Faucet
          </button>
        </div>
      </div>
    </div>
    <div class="border-t mt-2 pt-4">
      <h2 class="mb-4 font-bold uppercase">Blocks</h2>
      {#if blocks.length === 0}
        <div class="flex items-center justify-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
        </div>
      {:else}
        <div class="grid grid-cols-3 gap-4">
          {#if status.blockInProgress}
            <div class="p-4 bg-white rounded-xl shadow-md">
              <h4 class="text-gray-900 font-bold mb-2 uppercase text-sm">
                Block #{(blocks[0]?.height ?? 0) + 1}
              </h4>
              <div class="text-xs text-gray-600">In progress...</div>
            </div>
          {/if}
          {#each blocks as block}
            <div class="p-4 bg-white rounded-xl shadow-md">
              <h4 class="text-gray-900 font-bold mb-2 uppercase text-sm">
                Block #{block.height}
              </h4>
              {#if block.height > 0}
                <div class="text-xs text-gray-600">Now: {block.now}</div>
                <div class="overflow-hidden">
                  <a
                    href={txLink(block.txHash)}
                    target="_blank"
                    class="text-xs text-blue-500 line-clamp-1"
                  >
                    {block.txHash}
                  </a>
                </div>
              {:else}
                <div class="text-xs text-gray-600">Genesis</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
    <div class="flex justify-between mt-16 p-2 bg-slate-600 rounded text-xs text-gray-300">
      <p class="text-gray-300 line-clamp-1">
        <span class="text-gray-400">S:</span>
        {SEQUENCER_API_URL}
        {#if status.rollup}
          <span class="text-green-500">✅</span>
        {:else}
          <span class="text-red-500">❌</span>
        {/if}
      </p>
      <p class="text-gray-300">
        <span class="text-gray-400">N:</span>
        {NODE_API_URL}
        {#if status.node}
          <span class="text-green">✅</span>
        {:else}
          <span class="text-red">❌</span>
        {/if}
      </p>
    </div>
  {:catch error}
    <p>Error: {error.message}</p>
  {/await}
</div>
