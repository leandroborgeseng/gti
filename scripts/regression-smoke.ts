type Check = {
  name: string;
  url: string;
  method?: "GET" | "POST";
  body?: string;
  expectedStatus: number;
};

type Result = {
  check: Check;
  ok: boolean;
  status: number | null;
  detail: string;
};

const appUrl = process.env.SMOKE_APP_URL?.trim() || "http://localhost:3000";
const backendUrl = process.env.SMOKE_BACKEND_URL?.trim() || "http://localhost:4000/api";

/** Páginas Next e health (sem JWT). */
const publicChecks: Check[] = [
  { name: "Home/Kanban renderiza", url: `${appUrl}/`, expectedStatus: 200 },
  { name: "Health do servidor principal", url: `${appUrl}/health`, expectedStatus: 200 }
];

/**
 * API Nest (JWT obrigatório).
 * Nota: exportações CSV exigem papel EDITOR ou ADMIN; utilizador só VIEWER fará falhar estes três checks.
 */
const apiChecks: Check[] = [
  { name: "Sessão JWT (auth/me)", url: `${backendUrl}/auth/me`, expectedStatus: 200 },
  { name: "Resumo dashboard backend", url: `${backendUrl}/dashboard/summary`, expectedStatus: 200 },
  { name: "Alertas dashboard backend", url: `${backendUrl}/dashboard/alerts`, expectedStatus: 200 },
  { name: "Listagem contratos backend", url: `${backendUrl}/contracts`, expectedStatus: 200 },
  { name: "Listagem medições backend", url: `${backendUrl}/measurements`, expectedStatus: 200 },
  { name: "Listagem glosas backend", url: `${backendUrl}/glosas`, expectedStatus: 200 },
  { name: "Listagem governança backend", url: `${backendUrl}/governance/tickets`, expectedStatus: 200 },
  { name: "Listagem metas backend", url: `${backendUrl}/goals`, expectedStatus: 200 },
  { name: "Export CSV contratos", url: `${backendUrl}/exports/contracts.csv`, expectedStatus: 200 },
  { name: "Export CSV medições", url: `${backendUrl}/exports/measurements.csv`, expectedStatus: 200 },
  { name: "Export CSV glosas", url: `${backendUrl}/exports/glosas.csv`, expectedStatus: 200 }
];

async function resolveApiAuthHeaders(): Promise<Record<string, string> | null> {
  const bearer = process.env.SMOKE_API_BEARER?.trim();
  if (bearer) {
    return { Authorization: `Bearer ${bearer}` };
  }
  const email = process.env.SMOKE_EMAIL?.trim();
  const password = process.env.SMOKE_PASSWORD?.trim();
  if (!email || !password) {
    return null;
  }
  const r = await fetch(`${backendUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store"
  });
  if (!r.ok) {
    throw new Error(`Login na API de smoke falhou (HTTP ${r.status}). Verifique SMOKE_EMAIL/SMOKE_PASSWORD e a URL da API.`);
  }
  const { access_token } = (await r.json()) as { access_token: string };
  return { Authorization: `Bearer ${access_token}` };
}

async function runCheck(check: Check, extraHeaders?: Record<string, string>): Promise<Result> {
  try {
    const headers: Record<string, string> = { ...(extraHeaders ?? {}) };
    if (check.body) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(check.url, {
      method: check.method ?? "GET",
      headers: Object.keys(headers).length ? headers : undefined,
      body: check.body,
      cache: "no-store"
    });
    const ok = response.status === check.expectedStatus;
    return {
      check,
      ok,
      status: response.status,
      detail: ok ? "OK" : `esperado ${check.expectedStatus}, recebido ${response.status}`
    };
  } catch (error) {
    return {
      check,
      ok: false,
      status: null,
      detail: error instanceof Error ? error.message : "erro desconhecido"
    };
  }
}

function printResult(result: Result): void {
  const icon = result.ok ? "PASSOU" : "FALHOU";
  const statusText = result.status == null ? "sem status HTTP" : `HTTP ${result.status}`;
  console.log(`[${icon}] ${result.check.name} -> ${statusText} (${result.detail})`);
}

async function main(): Promise<void> {
  console.log("Iniciando smoke test de regressão...");
  console.log(`SMOKE_APP_URL=${appUrl}`);
  console.log(`SMOKE_BACKEND_URL=${backendUrl}`);
  console.log("");

  const results: Result[] = [];

  for (const check of publicChecks) {
    const result = await runCheck(check);
    results.push(result);
    printResult(result);
  }

  let apiHeaders: Record<string, string> | null = null;
  try {
    apiHeaders = await resolveApiAuthHeaders();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
    return;
  }

  if (!apiHeaders) {
    console.warn(
      "[AVISO] Sem SMOKE_EMAIL/SMOKE_PASSWORD nem SMOKE_API_BEARER: verificações da API Nest foram ignoradas (JWT obrigatório)."
    );
  } else {
    for (const check of apiChecks) {
      const result = await runCheck(check, apiHeaders);
      results.push(result);
      printResult(result);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log("");
  console.log(`Resultado: ${results.length - failed.length}/${results.length} verificações passaram.`);

  if (failed.length > 0) {
    console.log("Falhas encontradas:");
    for (const item of failed) {
      console.log(`- ${item.check.name}: ${item.detail}`);
    }
    process.exitCode = 1;
  }
}

void main();
