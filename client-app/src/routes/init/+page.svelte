<script lang="ts">
	import { goto } from '$app/navigation';
	import { initHDWallet, initWeb3Modal } from '$lib';

	let mnemonic = '';

	async function initHD() {
		try {
			await initHDWallet(mnemonic);
			goto('/app');
		} catch (err) {
			console.error(err);
		}
	}

	async function connectWallet() {
		try {
			await initWeb3Modal();
			goto('/app');
		} catch (err) {
			console.error(err);
		}
	}
</script>

<div class="border rounded-lg p-4 w-1/3">
	<div class="flex space-x-2">
		<input
			bind:value={mnemonic}
			type="text"
			placeholder="Mnemonic"
			class="border rounded-lg p-2 w-full"
		/>
		<button
			on:click={initHD}
			class="bg-yellow-400 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded"
		>
			Init
		</button>
	</div>
	<div class="flex space-x-2 mt-4">
		<button
			on:click={connectWallet}
			class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
		>
			Connect Wallet
		</button>
	</div>
</div>
