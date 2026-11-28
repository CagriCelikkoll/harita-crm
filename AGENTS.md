<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Araç kuralı (kalıcı)

npx, npm exec, pnpm dlx gibi komutlarla projede kurulu olmayan hiçbir aracı indirme ya da çalıştırma. Biçim denetimi için `npm run lint` kullan. Yeni bir araç gerekiyorsa önce sor.

Testler yalnızca `npm run test` / `npm test` ile çalıştırılır.
