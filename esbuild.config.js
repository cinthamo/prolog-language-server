// esbuild.config.js
const path = require('path');

require('esbuild').build({
  entryPoints: ['src/server.ts'],    // Your main server entry point
  bundle: true,                   // Bundle dependencies
  outfile: 'out/server.js',       // Output bundled file
  platform: 'node',               // Target platform is Node.js
  target: 'node18', // Or the Node version used by VS Code (check current VS Code docs)
  format: 'cjs',                  // Output format CommonJS
  external: ['vscode'],           // Important: Exclude 'vscode' module if you accidentally import it server-side
  sourcemap: true,                // Generate source maps for debugging
  logLevel: 'info',               // Show build info
  // Optional: Add plugins if needed later
  // plugins: [],
}).catch((err) => {
   console.error("esbuild failed:", err);
   process.exit(1)
});

console.log("esbuild configuration loaded.");
