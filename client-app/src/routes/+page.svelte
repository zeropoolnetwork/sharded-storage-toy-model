<script>
  import { initialized } from '$lib';
  import App from '$lib/pages/App.svelte';
  import Init from '$lib/pages/Init.svelte';
</script>

{#if $initialized}
  <App />
{:else}
  <Init />
{/if}


