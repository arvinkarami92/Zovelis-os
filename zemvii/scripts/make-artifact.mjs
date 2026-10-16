// Turn the demo build (web/dist-demo) into one self-contained HTML page:
// the stylesheet and the script are inlined, so the page needs no other files.
//
//   npm run build:demo && node scripts/make-artifact.mjs [output.html]

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const dist = join(root, 'web/dist-demo');
const out = resolve(process.argv[2] ?? join(root, 'web/dist-demo/zemvii-demo.html'));
const css = readFileSync(join(dist, 'assets/index.css'), 'utf8');
// A literal "</script" inside the bundle would end the inline script early.
const js = readFileSync(join(dist, 'assets/app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');

const html = `<title>Zemvii</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Zemvii: the social network that works for you. A working demo that runs in your browser.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Figtree:ital,wght@0,400..700;1,400&family=JetBrains+Mono:wght@500&display=swap">
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;
writeFileSync(out, html);
console.log(`Wrote ${out} (${Math.round(html.length / 1024)} KB)`);
