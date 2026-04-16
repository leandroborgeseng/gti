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

2. **Smoke test opcional em pipeline**  
   Executar `npm run smoke:regression` só em job manual ou com serviços mockados (hoje assume servidores no ar).

3. **Cadastro de estrutura do contrato na UI**  
   Telas para criar/editar **módulos**, **funcionalidades** (software) e **serviços** (datacenter) sem depender só do Prisma/API manual ou seeds.

4. **Upload real de anexos**  
   Hoje há placeholder em `Attachment`; falta storage (disco/S3), limite de tamanho, tipos MIME e vínculo estável na medição/glosa.

## Médio prazo

5. **Autenticação e perfis**  
   Utilizador real no `AuditLog` (substituir `system` onde fizer sentido), login e autorização por rota/módulo.

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

- **Actions**: não há workflow ativo (deploy Railway não depende de checks no GitHub).
- **Commits recentes** em `main`: simplificação de fluxos e documentação de migração/validação.
