import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { isoImport } from 'vite-plugin-iso-import';
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
	plugins: [sveltekit(), isoImport(), wasm(), topLevelAwait()],
	build: {
		target: 'esnext',
		commonjsOptions: {
			include: [/linked-dep/, /node_modules/],
		},
	},
	esbuild: {
		target: "es2022"
	},
	optimizeDeps: {
		include: ['linked-dep'],
		esbuildOptions: {
			target: "es2022",
		}
	},
});
