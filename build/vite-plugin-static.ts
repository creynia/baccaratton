import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { buildStaticSite, spaHead } from './static-site.ts';

/**
 * Emits the static SEO pages, sitemap.xml, llms.txt and llms-full.txt into dist/ (see
 * build/static-site.ts and docs/seo.md), and adds the canonical link, JSON-LD and a <noscript>
 * block to the SPA shell. Only added to non-single builds: the offline single file must stay
 * free of external links. The service worker never precaches these files (isStaticOutput).
 */
export function staticSitePlugin(): Plugin {
  let root = process.cwd();
  let outDir = 'dist';
  return {
    name: 'baccaratton-static-site',
    configResolved(c) {
      root = c.root;
      outDir = resolve(c.root, c.build.outDir);
    },
    transformIndexHtml(html) {
      const description = /<meta\s+name="description"\s+content="([^"]*)"/.exec(html)?.[1] ?? '';
      const head = spaHead(description.replace(/&amp;/g, '&'));
      return html
        .replace(
          '</head>',
          `<link rel="canonical" href="${head.canonical}" />\n${head.ld}\n</head>`,
        )
        .replace(/<body>/, `<body>\n${head.noscript}`);
    },
    writeBundle() {
      if (this.environment && this.environment.config.build.ssr) return;
      const site = buildStaticSite(root);
      for (const [rel, text] of site.files) {
        const file = join(outDir, rel);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
      }
    },
  };
}
