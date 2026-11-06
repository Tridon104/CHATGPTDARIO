import { build } from 'esbuild';
await build({
  entryPoints:['main.mjs'],outfile:'dist/main.mjs',
  bundle:true,format:'esm',platform:'node',target:'node22',
  external:['electron'],
  banner:{js:"import {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);"}
});
await build({
  entryPoints:['ui/app.js'],outfile:'dist/renderer.js',
  bundle:true,format:'iife',platform:'browser',target:'chrome126',minify:true
});
