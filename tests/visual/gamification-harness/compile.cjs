// Run with NODE_OPTIONS=--max-old-space-size=384 nice -n 10 node tests/visual/gamification-harness/compile.cjs
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '../../..');
const deps = process.env.ZYX_FIXTURE_DEPS || '/tmp/zyx-gamification-visual/node_modules';
const esbuild = require(path.join(deps, 'esbuild'));
const minify = process.env.ZYX_FIXTURE_MINIFY === '1';
const isolated = process.env.ZYX_FIXTURE_ISOLATED === '1';
const out = process.env.ZYX_FIXTURE_OUT || path.join(root, 'artifacts/visual-quality/gamification-fixture');
fs.mkdirSync(out, { recursive: true });
const aliases = {
  'next/link': 'shims.link.tsx', 'next/image': 'shims.image.tsx',
  'next/navigation': 'shims.navigation.ts', 'next/dynamic': 'shims.dynamic.tsx',
  '@/lib/auth-client': 'shims.auth.ts',
  '@/app/(student)/profile/actions': 'shims.actions.ts',
  '@/app/(student)/courses/[id]/solutions/[collectionId]/actions': 'shims.actions.ts',
  '@/components/course/article-parts': 'shims.content.tsx', '@/components/course/markdown-renderer': 'shims.content.tsx', '@/components/course/math-text': 'shims.content.tsx', '@/components/coding/article-coding': 'shims.content.tsx', '@/lib/materials/article-parts': 'shims.parts.ts', 'next-intl': 'shims.i18n.ts',
  '@/lib/i18n/client': 'shims.i18n.ts', '@/lib/i18n/server': 'shims.i18n.ts',
  '@/app/(student)/achievements/actions': process.env.ZYX_FIXTURE_REWARD_GUARD || (process.env.ZYX_FIXTURE_ACHIEVEMENTS === '1' ? 'shims.achievement-actions.ts' : 'shims.actions.ts'),
  '@/app/(student)/profile/edit/cosmetic-actions': 'shims.actions.ts',
  '@/lib/gamification/social-actions': process.env.ZYX_FIXTURE_SOCIAL_GUARD || 'shims.actions.ts',
  '@/app/(student)/dashboard/groups/actions': process.env.ZYX_FIXTURE_SOCIAL_GUARD || 'shims.actions.ts',
  '@/app/(student)/dashboard/groups/rename-actions': process.env.ZYX_FIXTURE_SOCIAL_GUARD || 'shims.actions.ts',
};
const plugin = { name: 'fixture-aliases', setup(build) {
  build.onResolve({ filter: /.*/ }, args => {
    if (args.path === './actions' && args.importer.endsWith('/gamification/ui.tsx')) return { path: path.join(__dirname, 'shims.actions.ts') };
    if (args.path === './entry' && process.env.ZYX_FIXTURE_ENTRY) return { path: process.env.ZYX_FIXTURE_ENTRY };
    if (aliases[args.path]) return { path: path.resolve(__dirname, aliases[args.path]) };
    if (args.path.startsWith('@/')) {
      const base = path.join(root, args.path.slice(2));
      const resolved = [base, ...['.tsx', '.ts', '.jsx', '.js', '.json'].map(ext => base + ext), ...['index.tsx', 'index.ts', 'index.js'].map(name => path.join(base, name))].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      if (resolved) return { path: resolved };
    }
  });
}};
(async () => {
  await esbuild.build({ ...(isolated ? { stdin: { contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import App from "./entry"; createRoot(document.getElementById("root")).render(<App/>);', loader: 'tsx', resolveDir: __dirname } } : { entryPoints: [path.join(__dirname, 'runtime.tsx')] }), minify, outfile: path.join(out, 'bundle.js'), bundle: true, format: 'iife', platform: 'browser', target: 'es2020', jsx: 'automatic', nodePaths: [deps], plugins: [plugin], define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'info' });
  let css = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
  css = css.replace('@import "tailwindcss";', `@import "${path.join(deps, 'tailwindcss/index.css')}" source(none);`)
    .replace('@import "tw-animate-css";', `@import "${path.join(deps, 'tw-animate-css/dist/tw-animate.css')}";`)
    .replace('@import "shadcn/tailwind.css";', '/* shadcn/tailwind.css unavailable in isolated fixture */');
  const sources = process.env.ZYX_FIXTURE_SOURCES ? JSON.parse(process.env.ZYX_FIXTURE_SOURCES) : ['components/gamification', 'components/course/solution-collection-reader.tsx', 'components/ui', 'components/admin', 'components/page-header.tsx', 'app/(student)/profile', 'app/(student)/achievements', 'app/(student)/leaderboard', 'app/(admin)/admin/(academic)/gamification', 'tests/visual/gamification-harness'];
  css = css.replace('@custom-variant', sources.map(p => `@source "${path.join(root, p)}";`).join('\n') + '\n@custom-variant');
  const input = path.join(out, 'input.css');
  fs.writeFileSync(input, css);
  execFileSync(process.execPath, [path.join(deps, '@tailwindcss/cli/dist/index.mjs'), '-i', input, '-o', path.join(out, 'styles.css'), ...(minify ? ['--minify'] : [])], { stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=384', RAYON_NUM_THREADS: '1' } });
  fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./styles.css"><link rel="stylesheet" href="./bundle.css"><title>Gamification fixture</title></head><body><div id="root"></div><script src="./bundle.js"></script></body></html>');
  fs.cpSync(path.join(root, 'public/gamification'), path.join(out, 'gamification'), { recursive: true });
  for (const name of fs.readdirSync(path.join(root, 'public'))) {
    if (name === 'gamification') continue;
    const target = path.join(out, name);
    if (!fs.existsSync(target)) fs.symlinkSync(path.join(root, 'public', name), target);
  }
  if (process.env.ZYX_FIXTURE_STANDALONE === '1') {
    let bundle = fs.readFileSync(path.join(out, 'bundle.js'), 'utf8');
    const styles = ['styles.css', 'bundle.css'].filter(name => fs.existsSync(path.join(out, name))).map(name => fs.readFileSync(path.join(out, name), 'utf8')).join('\n');
    const html = code => '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bingkai profil</title><style>' + styles + '</style></head><body><div id="root"></div><script>' + code.replace(/<\/script/gi, '<\\/script') + '</script></body></html>';
    const textBytes = Buffer.byteLength(html(bundle));
    if (textBytes >= 512000) throw Error('Standalone text exceeds 512k: ' + textBytes);
    const assets = [...new Set(bundle.match(/\/gamification\/[^"'\s]+\.(?:webp|png|svg)/g) || [])];
    for (const asset of assets) {
      const ext = path.extname(asset).slice(1);
      const data = 'data:image/' + (ext === 'svg' ? 'svg+xml' : ext) + ';base64,' + fs.readFileSync(path.join(root, 'public', asset)).toString('base64');
      bundle = bundle.split(asset).join(data);
    }
    fs.writeFileSync(path.join(out, 'standalone.html'), html(bundle));
    fs.writeFileSync(path.join(out, 'standalone-metadata.json'), JSON.stringify({ textBytes, inlinedAssets: assets, totalBytes: Buffer.byteLength(html(bundle)) }, null, 2));
  }
  console.log('Fixture:', out);
})().catch(error => { console.error(error); process.exitCode = 1; });
