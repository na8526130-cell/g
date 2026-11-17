import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const GAS_DIR = path.join(ROOT_DIR, 'gas');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.gif':
      return 'image/gif';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function buildAssetsHtml(): { count: number; totalBytes: number } {
  const assetDirs = [
    path.join(PUBLIC_DIR, 'assets', 'covers'),
    path.join(PUBLIC_DIR, 'assets', 'images'),
  ];

  const assetMap: Record<string, string> = {};

  for (const dir of assetDirs) {
    for (const file of walkFiles(dir)) {
      const relFromPublic = '/' + path.relative(PUBLIC_DIR, file).replace(/\\/g, '/');
      const mime = getMimeType(file);
      const b64 = fs.readFileSync(file).toString('base64');
      assetMap[relFromPublic] = `data:${mime};base64,${b64}`;
    }
  }

  // Also include icon.svg & apple-touch-icon.png if referenced
  for (const iconFile of ['icon.svg', 'apple-touch-icon.png']) {
    const full = path.join(PUBLIC_DIR, iconFile);
    if (fs.existsSync(full)) {
      const mime = getMimeType(full);
      const b64 = fs.readFileSync(full).toString('base64');
      assetMap[`/${iconFile}`] = `data:${mime};base64,${b64}`;
    }
  }

  const assetsHtmlContent = `<script>\nwindow.__GAS_LOCAL_ASSETS__ = ${JSON.stringify(assetMap)};\n</script>\n`;
  const outPath = path.join(GAS_DIR, 'assets.html');
  fs.writeFileSync(outPath, assetsHtmlContent, 'utf8');

  return {
    count: Object.keys(assetMap).length,
    totalBytes: Buffer.byteLength(assetsHtmlContent, 'utf8'),
  };
}

function buildIndexHtml(): { totalBytes: number } {
  const distIndexPath = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(distIndexPath)) {
    console.log('[build-gas] dist/index.html not found, running vite build...');
    execSync('npx vite build', { stdio: 'inherit', cwd: ROOT_DIR });
  }

  let html = fs.readFileSync(distIndexPath, 'utf8');

  // Remove PWA manifest & service worker script tags (not supported in GAS HtmlService)
  html = html.replace(/<link[^>]*rel=["']manifest["'][^>]*>\s*/gi, '');
  html = html.replace(/<script[^>]*id=["']vite-plugin-pwa:register-sw["'][^>]*><\/script>\s*/gi, '');
  html = html.replace(/<script[^>]*src=["']\/registerSW\.js["'][^>]*><\/script>\s*/gi, '');

  // Replace /apple-touch-icon.png and /icon.svg links with inline base64 data URIs
  for (const iconFile of ['apple-touch-icon.png', 'icon.svg']) {
    const full = path.join(PUBLIC_DIR, iconFile);
    if (fs.existsSync(full)) {
      const mime = getMimeType(full);
      const dataUri = `data:${mime};base64,${fs.readFileSync(full).toString('base64')}`;
      html = html.split(`"/${iconFile}"`).join(`"${dataUri}"`);
      html = html.split(`'/${iconFile}'`).join(`'${dataUri}'`);
    }
  }

  // Inline CSS <link rel="stylesheet" ... href="/assets/...">
  html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (_match, href) => {
    const cleanRel = href.replace(/^\//, '');
    const cssPath = path.join(DIST_DIR, cleanRel);
    if (!fs.existsSync(cssPath)) {
      throw new Error(`Referenced CSS file not found: ${cssPath}`);
    }
    const cssContent = fs.readFileSync(cssPath, 'utf8').replace(/<\/style/gi, '<\\/style');
    return `<style>\n${cssContent}\n</style>`;
  });

  // Collect JS <script type="module" ... src="/assets/..."> tags and inline cleanly
  const scriptRe = /<script([^>]*)src=["']([^"']+)["']([^>]*)><\/script>/gi;
  const inlinedScripts: string[] = [];
  html = html.replace(scriptRe, (match, beforeAttr, src, afterAttr) => {
    if (!src.startsWith('/assets/') && !src.startsWith('./assets/') && !src.startsWith('assets/')) {
      return match;
    }
    const cleanRel = src.replace(/^\.?\//, '');
    const jsPath = path.join(DIST_DIR, cleanRel);
    if (!fs.existsSync(jsPath)) {
      throw new Error(`Referenced JS file not found: ${jsPath}`);
    }
    const jsContent = fs.readFileSync(jsPath, 'utf8').replace(/<\/script>/gi, '<\\/script>');
    const isModule = /type=["']module["']/i.test(`${beforeAttr} ${afterAttr}`);
    inlinedScripts.push(`<script${isModule ? ' type="module"' : ''}>\n${jsContent}\n</script>`);
    return '';
  });

  // Inject GAS initialization scriptlets + assets include + inlined JS before </body>
  const gasInjection = [
    '<script>',
    '  window.__GAS_INIT_PARAMS__ = <?!= initParamsJson ?>;',
    '</script>',
    "<?!= include('assets') ?>",
    ...inlinedScripts,
  ].join('\n');

  const bodyCloseIdx = html.lastIndexOf('</body>');
  if (bodyCloseIdx === -1) {
    throw new Error('</body> tag not found in dist/index.html');
  }

  const finalHtml = html.slice(0, bodyCloseIdx) + gasInjection + '\n' + html.slice(bodyCloseIdx);
  const outPath = path.join(GAS_DIR, 'index.html');
  fs.writeFileSync(outPath, finalHtml, 'utf8');

  return {
    totalBytes: Buffer.byteLength(finalHtml, 'utf8'),
  };
}

function main() {
  fs.mkdirSync(GAS_DIR, { recursive: true });
  const assetsInfo = buildAssetsHtml();
  const indexInfo = buildIndexHtml();
  console.log(
    `[build-gas] Generated gas/assets.html (${assetsInfo.count} assets, ${(assetsInfo.totalBytes / 1024).toFixed(1)} KB)`
  );
  console.log(
    `[build-gas] Generated gas/index.html (${(indexInfo.totalBytes / 1024).toFixed(1)} KB)`
  );
}

main();
