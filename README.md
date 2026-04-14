# GLPI Sync MVP

MVP em Node.js + TypeScript para sincronizar tickets do GLPI para SQLite (Prisma), com execucao em container unico no Railway.

## Requisitos

- Node.js 20+
- Credenciais da API GLPI

## Configuracao

1. Copie `.env.example` para `.env`.
2. Preencha as variaveis obrigatorias:
   - `GLPI_BASE_URL`
   - `GLPI_DOC_URL`
   - `GLPI_CLIENT_ID`
   - `GLPI_CLIENT_SECRET`
   - `GLPI_USERNAME`
   - `GLPI_PASSWORD`

## Rodar local

```bash
npm install
npm run prisma:generate
npm run dev
```

## Comportamento

- Inicializa schema SQLite automaticamente.
- Baixa `doc.json` e detecta endpoint de tickets.
- Faz autenticacao com cache de token e refresh automatico.
- Sincroniza tickets imediatamente e depois a cada 5 minutos.
- Exponibiliza `GET /` com resposta `GLPI Sync Running`.

# gti
