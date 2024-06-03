<script>
	import { goto } from '$app/navigation';
	import { initHDWallet } from '$lib';
	import { onMount } from 'svelte';

	onMount(async () => {
		try {
			await initHDWallet();
			goto('/app');
		} catch (err) {
			console.error(err);
			goto('/init');
		}
	});
</script>
