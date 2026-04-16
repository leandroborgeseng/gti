# Etapa 1 — Paridade funcional enxuta (visual + fluxos)

## Objetivo

Mapear funcionalidades do sistema antigo para o sistema atual com foco em:

- Reaproveitar a experiência visual e os fluxos de trabalho.
- Reduzir campos de cadastro para operação prática.
- Evitar criação de tabelas/campos que não serão usados no recadastro.

## Origem analisada

- Projeto legado: `gestao_de_contratos`
- Arquivos de referência:
  - `apps/backend/prisma/schema.prisma`
  - componentes de contratos, medições, metas e kanban GLPI.

## Mapa de paridade funcional

### 1) Contratos e estrutura técnica

| Legado | Atual | Status |
|---|---|---|
| `Contrato` (cadastro amplo) | `Contract` (cadastro mínimo) | Ajustar |
| `Modulo` | `ContractModule` | Parcial |
| `ItemContratual` | `ContractFeature` | Parcial |
| `ServicoCatalogo` | `ContractService` | Parcial |
| `AditivoContrato` | (não priorizar agora) | Backlog |
| `ReajusteContrato` | (não priorizar agora) | Backlog |
| `MarcoImplantacao` | (não priorizar agora) | Backlog |
| `ParcelaPagamento` | (não priorizar agora) | Backlog |

### 2) Medição e glosa

| Legado | Atual | Status |
|---|---|---|
| `MedicaoMensal` | `Measurement` | Parcial |
| `AvaliacaoItem` + checklist | `MeasurementItem` simplificado | Ajustar |
| `Anexo` (evidência) | `Attachment` | Parcial |
| `Glosa` com contexto avançado | `Glosa` | Parcial |
| Fechamento de competência (ABERTA/FECHADA/...) | (opcional na fase inicial) | Backlog |

### 3) Datacenter (capacidade e consumo)

| Legado | Atual | Status |
|---|---|---|
| `ContratoDatacenter` e itens previstos | regra simplificada por serviço | Ajustar |
| Consumo mensal por item/licença | cadastro único de itens | Ajustar |
| Cálculo variável por consumo | manter | Manter |

### 4) Governança SLA

| Legado/Regra | Atual | Status |
|---|---|---|
| Fluxo de chamado com SLA | `TicketGovernance` | Parcial |
| Eventos de processo | `TicketEventLog` | Parcial |
| Extensão de prazo | `TicketDeadlineExtension` | Parcial |
| Watchers/controle | `TicketWatcher` | Parcial |
| Regras condicionais completas (gestor/controladoria) | versão essencial | Ajustar |

### 5) Metas e desdobramentos

| Legado | Atual | Status |
|---|---|---|
| `MetaPlanejamento` | `Goal` | Parcial |
| `MetaDesdobramento` | `GoalAction` | Parcial |
| vínculo GLPI/meta | `GoalLink` (genérico) | Parcial |
| exportação e visão avançada | (não priorizar agora) | Backlog |

### 6) Auditoria e segurança

| Legado | Atual | Status |
|---|---|---|
| `HistoricoAuditoria` | `AuditLog` | Parcial |
| usuários/perfis/permissões | (não priorizar agora) | Backlog |
| trilha de alterações em todas ações críticas | Parcial | Parcial |

## Campos mínimos sugeridos (recadastro)

1. **Contrato**: número, nome, fornecedor, tipo, vigência início/fim, valor mensal, fiscal.
2. **Medição**: contrato, mês/ano, itens (feature/serviço), cálculo, status.
3. **Glosa**: medição, tipo, valor, justificativa.
4. **Fornecedor**: nome, CNPJ.
5. **Fiscal**: nome, e-mail, telefone.
6. **Governança ticket**: ticket, prioridade, prazo SLA, status, justificativa.
7. **Meta**: título, ano, responsável, status, progresso.

## Escopo fora da fase inicial

- Aditivos, reajustes, marcos e parcelas.
- Perfis/permissões avançados.
- Exportações e relatórios avançados.
- Datacenter com modelagem expandida de capacidade/licenciamento.

## Critério de saída da Etapa 1

- Mapa funcional enxuto documentado.
- Campos mínimos por módulo aprovados.
- Pronto para iniciar implementação da Etapa 2 com simplificação de formulários e regras essenciais.
