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

<div class="flex h-screen md:items-center justify-center">
  {#if loading}
    <p>Loading...</p>
  {:else}
    <slot />
  {/if}

  <ErrorPopup />
</div>
