# Etapa 0 — Baseline e proteção de regressão

## Objetivo

Estabelecer uma linha de base objetiva do comportamento atual para permitir evolução do sistema com **referência visual/UX** no sistema antigo, sem migração de dados legados e sem quebra operacional.

## Escopo desta etapa

- Inventário funcional do sistema atual (produção).
- Definição de checklist de regressão mínima.
- Definição de política de rollout por etapas.
- Critérios de aceite por módulo.
- Registro de diretriz: **recadastro total** com **formulários enxutos**.

## Inventário funcional atual (resumo)

### Núcleo operacional (`apps/frontend` + worker opcional)

- Quadro Kanban de chamados GLPI (`/chamados`).
- Modal de detalhamento/edição de chamado.
- Publicação de acompanhamento no chamado.
- Proxy para anexos/imagens GLPI.
- Filtros operacionais e recálculo de pendência.
- Sincronização GLPI: `instrumentation.ts` e/ou `npm run start:worker`.

### Módulos de gestão (`apps/backend` + `apps/frontend`)

- Contratos, medições, glosas, dashboard.
- Governança de chamados SLA.
- Metas e desdobramentos.
- Cadastros de fornecedores e fiscais.

## Checklist de regressão mínima (obrigatório a cada etapa)

1. Aplicação sobe sem erro em ambiente local.
2. Deploy inicia sem erro de build/runtime.
3. Tela inicial abre e renderiza menu + conteúdo.
4. Kanban GLPI carrega e abre modal de ticket.
5. Endpoint `GET /health` responde `200`.
6. Endpoints `GET /api/dashboard/summary` e `GET /api/dashboard/alerts` respondem.
7. Rotas de módulos não ficam em branco.
8. Formulários críticos renderizam e validam.

## Política de rollout incremental

- A migração será feita em fases pequenas.
- Cada fase finaliza com:
  - validação manual via checklist de regressão,
  - commit isolado e descritivo,
  - push para teste em ambiente remoto.
- Não haverá substituição completa de frontend/backend em um único merge.

## Critérios de pronto por módulo

Um módulo só é considerado pronto quando possui:

- Listagem.
- Formulário de cadastro/edição com validação.
- Detalhe operacional (quando aplicável).
- Regras críticas no backend.
- Registro de auditoria nas ações críticas.

## Decisões registradas

- Estratégia adotada: **migração por etapas**.
- Reuso do sistema antigo focado em **layout, fluxos e usabilidade**.
- **Não migrar dados antigos**; todo cadastro será novo.
- Reduzir cadastros para o **mínimo de campos obrigatórios**.
- Preservação do comportamento operacional de GLPI durante toda a migração.
