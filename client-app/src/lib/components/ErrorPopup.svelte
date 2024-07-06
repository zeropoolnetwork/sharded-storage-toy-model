<script>
  import { hideError, error } from '$lib/error';
</script>

{#if $error}
  <div class="fixed inset-0 flex items-center justify-center z-50">
    <div class="absolute inset-0 bg-black opacity-50" on:click={hideError}></div>
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 z-10">
      <div class="flex justify-between items-start">
        <div class="flex items-center">
          <svg class="w-6 h-6 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <h3 class="text-lg font-semibold text-gray-900">Error</h3>
        </div>
        <button on:click={hideError} class="text-gray-400 hover:text-gray-500">
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      <p class="mt-4 text-sm text-gray-500">{$error}</p>
    </div>
  </div>
{/if}