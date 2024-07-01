<script>
  import { goto } from '$app/navigation';
  import { isWalletInitialized } from '$lib';
  import { onMount } from 'svelte';

  onMount(async () => {
    if (isWalletInitialized()) {
      goto('/app');
    } else {
      goto('/init');
    }
  });
</script>
