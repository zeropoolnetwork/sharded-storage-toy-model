<script lang="ts">
  import { goto } from '$app/navigation';
  import { initHDWallet, initWeb3Modal, modalInProgress } from '$lib';
  import { DEBUG_SEED } from '$lib/api';
  import { onMount } from 'svelte';
  import { showError } from '$lib/error';

  let mnemonic = '';

  async function initHD() {
    try {
      await initHDWallet(mnemonic);
      await goto('/app');
    } catch (e: any) {
      console.error(e);
      showError(e.toString());
    }
  }

  async function connectWallet() {
    try {
      await initWeb3Modal();
      await goto('/app');
    } catch (e: any) {
      console.error(e);
      showError(e.toString());
    }
  }

  onMount(async () => {
    if (DEBUG_SEED && DEBUG_SEED.length > 0) {
      mnemonic = DEBUG_SEED;
      await initHDWallet(mnemonic);
      await goto('/app');
    }
  });
</script>

<div class="border rounded-lg p-4 w-full sm:w-2/3 lg:w-1/3 bg-slate-100">
  {#if modalInProgress}
    <div class="flex justify-center">
      <button
        on:click={connectWallet}
        class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
      >
        Sign Message
      </button>
    </div>
  {:else}
    <div class="flex justify-center">
      <button
        on:click={connectWallet}
        class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
      >
        Connect Wallet
      </button>
    </div>
    <div class="flex justify-center mt-4">
      <p class="text-base text-gray-500">or</p>
    </div>
    <div class="flex space-x-2 mt-4">
      <input
        bind:value={mnemonic}
        type="text"
        placeholder="Mnemonic"
        class="border rounded-lg p-2 w-full"
      />
      <button
        on:click={initHD}
        class="bg-orange-400 hover:bg-orange-500 text-white font-bold py-2 px-4 rounded"
      >
        Init
      </button>
    </div>
  {/if}
</div>
