import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{
            name: 'three-vendor',
            test: /[\\/]node_modules[\\/]three[\\/]/,
            includeDependenciesRecursively: false,
          }, {
            name: 'ui-shared',
            test: /[\\/]src[\\/](data\.ts|ui[\\/]components\.ts)$/,
            includeDependenciesRecursively: false,
          }],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
