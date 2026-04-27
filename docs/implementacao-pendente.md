# Implementação pendente (visão atual)

Este documento resume o que **ainda não está completo** ou **vale evoluir**, alinhado à decisão de **cadastro enxuto**, **sem migração de dados legados** e **não quebrar o núcleo GLPI**.

## Já entregue (referência rápida)

- Núcleo GLPI: Kanban, modal, sincronização, health e APIs auxiliares.
- Módulo contratos (Nest + Prisma + Next): contratos, medições, glosas, fornecedores, fiscais, dashboard, governança SLA, metas.
- Regras de fluxo: cálculo/aprovação de medição, glosa com atualização de totais, auditoria ampliada em pontos críticos.
- UX: telas mais simples, formulários reduzidos e smoke test local; typecheck recomendado antes do push (sem workflow no GitHub).

## Curto prazo (próximas entregas sugeridas)

1. **Frontend com lockfile** *(feito)*  
   `apps/frontend/package-lock.json` versionado; usar `npm ci` no deploy.

2. **Smoke test opcional em pipeline** *(feito)*  
   Workflow manual em `.github/workflows/smoke-manual.yml` (`workflow_dispatch` com URLs da app e da API). Executa `npm run smoke:regression` na raiz.

3. **Cadastro de estrutura do contrato na UI** *(parcial — edição na ficha do contrato)*  
   Na rota `/contracts/[id]`, módulos, funcionalidades (por módulo) e serviços passam a ser criados/editados/removidos via API Nest (`POST/PUT/DELETE` em `/api/contracts/...`). **UX de pesos:** resumo da soma dos módulos (meta 1), soma por módulo nas funcionalidades, destaque quando fora da tolerância e confirmação ao salvar se a soma projetada não for ≈ 1 (`apps/frontend/src/lib/contract-weights.ts`). A rota `(gestao)/contracts/[id]` reutiliza o mesmo editor. **Opcional futuro:** reordenar módulos/funcionalidades (ex.: `sortOrder` no Prisma + API) para suportar arrastar e largar com persistência.

4. **Upload real de anexos** *(feito — disco local)*  
   `POST` multipart em `/api/measurements/:id/attachments` e `/api/glosas/:id/attachments`; arquivos em `UPLOAD_ROOT` (ex.: `./uploads`); limite `UPLOAD_MAX_MB`; MIME permitidos com lista extensível `UPLOAD_EXTRA_MIME`. Download: `GET /api/attachments/:id/download`. UI de envio na ficha da medição (`/measurements/[id]`) e na ficha da glosa (`GET /api/glosas/:id`, rota `/glosas/[id]`). Para S3, substituir `StorageService` em uma fase seguinte.

## Médio prazo

5. **Autenticação e perfis** *(parcial — MVP JWT)*  
   Modelo `User` (papéis `ADMIN`, `EDITOR`, `VIEWER`), `POST /api/auth/login`, JWT global nas rotas Nest, `AuditLog.userId` e operações críticas com ator do contexto (`getAuditActorId` / `getAuditActorLabel` para glosas). Next: `/login`, cookie `gti_token`, middleware nas rotas de gestão, proxy `/api/attachments/:id/download`, link **Sair**. Seed: `npx prisma db seed` (credenciais `BOOTSTRAP_ADMIN_*` em `apps/backend/.env.example`). Smoke: `SMOKE_EMAIL`/`SMOKE_PASSWORD` ou `SMOKE_API_BEARER`. **Pendente:** gestão de usuários na UI, perfis por módulo finos, refresh token, cookie httpOnly + BFF se endurecer segurança.

6. **Relatórios e exportação**  
   PDF/Excel, filtros por competência e pacote para auditoria externa.

7. **Tipos de contrato INFRA / SERVICO**  
   Regras de medição e telas alinhadas (hoje o foco operacional está em SOFTWARE + DATACENTER).

## Longo prazo / opcional

8. **Módulo de projetos**  
   Vincular tarefas que não passam pelo gestor de chamados (GLPI); planeamento fora do ciclo ticket.

9. **Paridade visual com o sistema antigo**  
   Copiar mais padrões de layout/fluxo sem reintroduzir complexidade de dados.

10. **Integrações adicionais**  
   Notificações (e-mail/push), webhooks, filas.

11. **Testes automatizados e2e**  
    Playwright ou similar para GLPI + módulo de contratos.

## Como acompanhar o projeto no GitHub

- **Actions**: workflow manual de smoke em `.github/workflows/smoke-manual.yml` (o deploy na Railway não depende de checks obrigatórios no GitHub).
- **Commits recentes** em `main`: simplificação de fluxos e documentação de migração/validação.
