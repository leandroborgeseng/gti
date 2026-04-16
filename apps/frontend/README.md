# Frontend — Next.js + React

## Stack

- **React 18** e **Next.js 14** (App Router), **TypeScript**.
- Estilos: **Tailwind CSS**.
- Rotas de gestão contratual: `src/app/(gestao)/` (layout com sidebar comum).
- Kanban GLPI (provisório): proxy em `src/app/operacao/glpi/[[...path]]/route.ts` até existir UI em React.

## Manutenção

- **Server Components por defeito** — ficheiros `page.tsx` sem `"use client"` quando só precisam de dados no servidor (menos JavaScript no browser, mais fácil de evoluir).
- **`"use client"`** apenas em formulários, modais, navegação client-side e outro estado local (`src/components/actions/*`, modais, etc.).
- API de contratos: `src/lib/api.ts` com `fetch` e `NEXT_PUBLIC_BACKEND_URL`.
- APIs GLPI no mesmo host: `next.config.mjs` (rewrites) + variável `GLPI_SYNC_ORIGIN`.

## Performance (boas práticas actuais)

- Evitar empacotar bibliotecas pesadas em client components desnecessários.
- Listas e KPIs: preferir dados no servidor e hidratação mínima.
- PWA: `src/app/manifest.ts` + metadados em `src/app/layout.tsx`; service worker numa fase seguinte (ver `docs/stack-unificado.md`).

## Comandos

```bash
npm ci
npm run dev    # porta 3001 por defeito
npm run build
npm run typecheck
```

Variáveis: copiar `.env.example` para `.env.local`.
