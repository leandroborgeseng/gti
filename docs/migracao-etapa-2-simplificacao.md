# Etapa 2 — Simplificação de cadastro (executado)

## Diretriz aplicada

- Reaproveitar visual/fluxo.
- Reduzir campos obrigatórios.
- Não migrar dados legados.

## Ajustes realizados

### Contratos

- `lawType`, `status`, `totalValue` e `managerId` agora podem ser omitidos no cadastro.
- Defaults automáticos no backend:
  - `lawType`: `LEI_14133`
  - `status`: `ACTIVE`
  - `totalValue`: `monthlyValue * 12`
  - `managerId`: mesmo valor de `fiscalId`, quando não informado.
- Formulário simplificado para foco em campos essenciais.

### Governança de tickets

- `openedAt` passou a ser opcional.
- Quando omitido, o backend usa data/hora atual.

### Metas

- `status` e `priority` passaram a ser opcionais.
- Defaults automáticos:
  - `status`: `PLANNED`
  - `priority`: `MÉDIA`
- Formulário simplificado com prioridade opcional.

### Etapa 2.1 (telas enxutas)

- Listagens de contratos e medições sem coluna de ID técnico.
- Inclusão de informações mais úteis na operação:
  - valor mensal em contratos,
  - valor aprovado em medições.
- Tradução de status técnicos para rótulos amigáveis em pt-BR.
- Detalhes de contrato, medição, governança e metas reorganizados para resumo executivo.

### Etapa 2.2 (início)

- Formulário de medição com mês/ano padrão da competência atual.
- Mensagens orientativas em formulários para reduzir erro de cadastro.

### Etapa 2.3 (regras de fluxo)

- Bloqueio de recálculo para medição já aprovada.
- Bloqueio de aprovação em medição ainda aberta (sem cálculo).
- Bloqueio de glosa em medição não calculada.
- Recalculo automático dos totais ao registrar glosa:
  - `totalGlosedValue`
  - `totalApprovedValue` (com piso em zero)
  - status da medição atualizado para `GLOSSED` quando aplicável.
- Feedback visual no frontend para ações bloqueadas por status.

### Etapa 2.4 (auditoria completa - andamento)

- Padronização de auditoria no módulo de glosas com método interno único.
- Governança: inclusão de auditoria para:
  - criação de extensão de prazo (`TicketDeadlineExtension`),
  - upsert de watcher da controladoria,
  - mudanças automáticas no monitoramento de SLA (`AUTO_ESCALATE`, `AUTO_SLA_VIOLATION`).
- Metas:
  - auditoria para ação criada por ajuste manual de progresso,
  - auditoria automática quando status da meta muda por recálculo (`AUTO_STATUS_UPDATE`).

### Etapa 2.5 (validação GLPI + regressão - andamento)

- Criação de script de smoke test: `npm run smoke:regression`.
- Cobertura inicial de endpoints críticos:
  - home/Kanban,
  - health,
  - dashboard (summary/alerts),
  - contratos, medições, glosas, governança e metas.
- Criação de checklist manual de regressão em `docs/validacao-etapa-2-5-regressao.md`.

## Observações de validação

- Foram mantidas validações essenciais de domínio.
- Não foram executados builds completos de backend/frontend neste ambiente porque os binários locais (`nest` e `next`) não estavam disponíveis.
