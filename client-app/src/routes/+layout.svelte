<script>
  import '../app.css';
  import { afterNavigate, beforeNavigate } from '$app/navigation';
  import ErrorPopup from '$lib/components/ErrorPopup.svelte';

  let loading = false;

  beforeNavigate(() => {
    loading = true;
  });

  afterNavigate(() => {
    loading = false;
  });
</script>

<div class="flex flex-col h-screen md:items-center justify-center">
  {#if loading}
    <p>Loading...</p>
  {:else}
    <slot />
  {/if}

  <div class="p-4 w-full">
    <div class="flex justify-center mt-4 p-2 text-xs text-blue-700">
      <a href="https://github.com/zeropoolnetwork/sharded-storage-toy-model" target="_blank">
        GitHub
      </a>
    </div>
  </div>

  <ErrorPopup />
</div>
