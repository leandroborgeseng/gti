# Frontend — Next.js + React

## Stack

- **React 18** e **Next.js 14** (App Router), **TypeScript**.
- Estilos: **Tailwind CSS**.
- Rotas de gestão contratual: `src/app/(gestao)/` (layout com sidebar comum).
- Kanban GLPI: rota **`/chamados`** (`src/app/(gestao)/chamados/`) com dados via `src/glpi/kanban-load.ts` e APIs em `src/app/api/...`.

## Manutenção

- **Server Components por padrão** — arquivos `page.tsx` sem `"use client"` quando só precisam de dados no servidor (menos JavaScript no browser, mais fácil de evoluir).
- **`"use client"`** apenas em formulários, modais, navegação client-side e outro estado local (`src/components/actions/*`, modais, etc.).
- API de contratos: `src/lib/api.ts` com `fetch` e `NEXT_PUBLIC_BACKEND_URL`.
- APIs GLPI no mesmo host: `src/app/api/kanban`, `src/app/api/tickets/glpi/...`, etc. Variáveis `GLPI_*` no `.env.local` (ver `.env.example`).

## Performance (boas práticas atuais)

- Evitar empacotar bibliotecas pesadas em client components desnecessários.
- Listas e KPIs: preferir dados no servidor e hidratação mínima.
- PWA: `src/app/manifest.ts` + metadados em `src/app/layout.tsx`; service worker em uma fase seguinte (ver `docs/stack-unificado.md`).

## Comandos

```bash
npm ci
npm run dev    # porta 3001 por padrão
npm run build
npm run typecheck
```

Variáveis: copiar `.env.example` para `.env.local`.

**Prisma:** o schema único está em **`apps/backend/prisma/schema.prisma`**. O cliente gerado fica em **`node_modules/.prisma/client` na raiz** do monorepo (ver `output` no gerador). O `tsconfig` aponta `@prisma/client` para a raiz. Na raiz, `npm install` roda **`postinstall`** com `prisma generate` (necessário no Railway). É necessário **`DATABASE_URL`** (PostgreSQL) igual ao do backend.

**Build:** `GLPI_SKIP_BOOTSTRAP=1` é definido no script `build` para não iniciar o cron nem exigir credenciais GLPI durante `next build` (usa URLs fictícias só na fase de compilação).
