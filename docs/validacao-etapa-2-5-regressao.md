# Etapa 2.5 — Validação GLPI e regressão

## Objetivo

Garantir que a evolução do módulo de contratos não quebre o núcleo operacional já estável do GLPI (Kanban, modal e sincronização).

## Execução rápida (smoke test)

Com o servidor em execução:

```bash
npm run smoke:regression
```

Opcionalmente, para ambiente/porta diferente:

```bash
SMOKE_APP_URL="http://localhost:3000" SMOKE_BACKEND_URL="http://localhost:3000/api" npm run smoke:regression
```

## Checklist manual obrigatório

1. Abrir `GET /` e confirmar renderização do quadro Kanban.
2. Abrir um card e validar exibição de modal.
3. Confirmar que o modal carrega dados do chamado sem erro.
4. Executar `Recalcular pendência` e verificar feedback visual.
5. Validar `GET /health` com resposta `200`.
6. Validar `GET /api/dashboard/summary` com resposta `200`.
7. Validar `GET /api/dashboard/alerts` com resposta `200`.
8. Validar rotas de frontend do módulo novo:
   - `/dashboard`
   - `/contracts`
   - `/measurements`
   - `/glosas`
   - `/governance/tickets`
   - `/goals`
9. Confirmar criação de um contrato enxuto.
10. Confirmar fluxo de medição: criar -> calcular -> aprovar.
11. Confirmar lançamento de glosa e atualização dos totais da medição.
12. Confirmar criação de evento de governança e atualização de timeline.

## Critério de aprovação da etapa

- Smoke test sem falhas críticas.
- Checklist manual completo com todos os itens em conformidade.
- Nenhuma regressão funcional em Kanban GLPI, modal ou sincronização.
