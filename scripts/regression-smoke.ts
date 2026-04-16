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
const backendUrl = process.env.SMOKE_BACKEND_URL?.trim() || "http://localhost:3000/api";

const checks: Check[] = [
  { name: "Home/Kanban renderiza", url: `${appUrl}/`, expectedStatus: 200 },
  { name: "Health do servidor principal", url: `${appUrl}/health`, expectedStatus: 200 },
  { name: "Resumo dashboard backend", url: `${backendUrl}/dashboard/summary`, expectedStatus: 200 },
  { name: "Alertas dashboard backend", url: `${backendUrl}/dashboard/alerts`, expectedStatus: 200 },
  { name: "Listagem contratos backend", url: `${backendUrl}/contracts`, expectedStatus: 200 },
  { name: "Listagem medições backend", url: `${backendUrl}/measurements`, expectedStatus: 200 },
  { name: "Listagem glosas backend", url: `${backendUrl}/glosas`, expectedStatus: 200 },
  { name: "Listagem governança backend", url: `${backendUrl}/governance/tickets`, expectedStatus: 200 },
  { name: "Listagem metas backend", url: `${backendUrl}/goals`, expectedStatus: 200 }
];

async function runCheck(check: Check): Promise<Result> {
  try {
    const response = await fetch(check.url, {
      method: check.method ?? "GET",
      headers: check.body ? { "Content-Type": "application/json" } : undefined,
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
  for (const check of checks) {
    const result = await runCheck(check);
    results.push(result);
    printResult(result);
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
    return;
  }
}

void main();
