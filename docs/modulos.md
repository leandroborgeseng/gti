# Mapa de módulos (GTI)

| Área | Localização | Notas |
|------|-------------|--------|
| GLPI — cliente HTTP, token, retries | `apps/frontend/src/glpi/services/glpi.client.ts`, `auth.service.ts` | |
| GLPI — job de sync, persistência, normalização | `apps/frontend/src/glpi/jobs/`, `services/ticket-persist.service.ts`, `normalizers/` | |
| GLPI — Kanban (payload servidor) | `apps/frontend/src/glpi/kanban-load.ts`, `kanban-settings.ts` | |
| GLPI — APIs HTTP | `apps/frontend/src/app/api/kanban`, `tickets/glpi`, `settings/sync-scope`, … | |
| Contratos / medições / glosas (Nest) | `apps/backend/src/` | API REST separada do Next |
| UI Next (páginas) | `apps/frontend/src/app/` | Inclui `/chamados`, `/contracts`, … |
