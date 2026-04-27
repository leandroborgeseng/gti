import * as XLSX from "xlsx";
import type { ContractFeatureStatus, ContractItemDeliveryStatus } from "@prisma/client";
import type { ContractStructureImportRow } from "@gestao/modules/contracts/contracts.dto";

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function normHeader(s: unknown): string {
  return stripAccents(String(s ?? "").trim().replace(/^\uFEFF/, "").toLowerCase()).replace(/\s+/g, "_");
}

function parseDecimalCell(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const STATUS_ALIASES: Record<string, ContractFeatureStatus> = {
  not_started: "NOT_STARTED",
  nao_iniciada: "NOT_STARTED",
  em_progresso: "IN_PROGRESS",
  in_progress: "IN_PROGRESS",
  entregue: "DELIVERED",
  delivered: "DELIVERED",
  validada: "VALIDATED",
  validated: "VALIDATED"
};

const DELIVERY_ALIASES: Record<string, ContractItemDeliveryStatus> = {
  not_delivered: "NOT_DELIVERED",
  nao_entregue: "NOT_DELIVERED",
  partially_delivered: "PARTIALLY_DELIVERED",
  parcialmente_entregue: "PARTIALLY_DELIVERED",
  parcial: "PARTIALLY_DELIVERED",
  delivered: "DELIVERED",
  entregue: "DELIVERED"
};

function parseStatus(raw: unknown): ContractFeatureStatus | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  const u = s.toUpperCase().replace(/\s+/g, "_");
  if (u === "NOT_STARTED" || u === "IN_PROGRESS" || u === "DELIVERED" || u === "VALIDATED") {
    return u as ContractFeatureStatus;
  }
  const nk = normHeader(s);
  return STATUS_ALIASES[nk];
}

function parseDelivery(raw: unknown): ContractItemDeliveryStatus | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  const u = s.toUpperCase().replace(/\s+/g, "_");
  if (u === "NOT_DELIVERED" || u === "PARTIALLY_DELIVERED" || u === "DELIVERED") {
    return u as ContractItemDeliveryStatus;
  }
  const nk = normHeader(s);
  return DELIVERY_ALIASES[nk];
}

const HEADER_ALIASES: Record<string, string> = {
  modulo_nome: "modulo_nome",
  nome_modulo: "modulo_nome",
  módulo: "modulo_nome",
  modulo_peso: "modulo_peso",
  peso_modulo: "modulo_peso",
  funcionalidade_nome: "funcionalidade_nome",
  nome_funcionalidade: "funcionalidade_nome",
  funcionalidade: "funcionalidade_nome",
  funcionalidade_peso: "funcionalidade_peso",
  peso_funcionalidade: "funcionalidade_peso",
  funcionalidade_status: "funcionalidade_status",
  status: "funcionalidade_status",
  funcionalidade_entrega: "funcionalidade_entrega",
  entrega: "funcionalidade_entrega",
  estado_entrega: "funcionalidade_entrega"
};

function canonicalHeader(cell: unknown): string | null {
  const n = normHeader(cell);
  const mapped = HEADER_ALIASES[n];
  if (mapped) return mapped;
  return HEADER_ALIASES[n.replace(/^col_/, "")] ?? null;
}

/** Gera o arquivo .xlsx modelo (folhas Instrucoes + Dados). */
export function buildContractStructureTemplateBuffer(_contractNumber: string): Buffer {
  const instr: string[][] = [
    ["Modelo — módulos e funcionalidades do contrato"],
    [""],
    ["Preencha apenas a aba «Dados». Pode apagar as linhas de exemplo."],
    [""],
    ["Colunas obrigatórias"],
    ["modulo_nome — nome do módulo (repetir o mesmo nome em várias linhas para várias funcionalidades no mesmo módulo)."],
    ["modulo_peso — peso do módulo na soma global (ex.: 0,6). Deve ser igual em todas as linhas do mesmo módulo."],
    ["funcionalidade_nome — nome da funcionalidade / item."],
    ["funcionalidade_peso — peso dentro do módulo (soma por módulo ≈ 1)."],
    [""],
    ["Colunas opcionais (códigos em inglês ou rótulos em português)"],
    [
      "funcionalidade_status — NOT_STARTED | IN_PROGRESS | DELIVERED | VALIDATED (ou: não iniciada, em progresso, entregue, validada)."
    ],
    [
      "funcionalidade_entrega — NOT_DELIVERED | PARTIALLY_DELIVERED | DELIVERED (ou: não entregue, parcialmente entregue, entregue)."
    ],
    [""],
    ["Importação"],
    [
      "Ao importar sem «substituir», o sistema acrescenta módulos novos e funcionalidades aos módulos já existentes (nome do módulo sem distinção de maiúsculas)."
    ],
    ["Com «substituir», remove todos os módulos e funcionalidades atuais do contrato antes de importar."],
    [""],
    ["No cadastro do contrato (página web) pode ainda definir as datas de início e fim do período de implantação e os valores de implantação e mensalidade — o sistema calcula os indicadores proporcionais por fase."]
  ];

  const dataSheet: (string | number)[][] = [
    ["modulo_nome", "modulo_peso", "funcionalidade_nome", "funcionalidade_peso", "funcionalidade_status", "funcionalidade_entrega"],
    ["Módulo A", 0.6, "Funcionalidade 1", 0.5, "NOT_STARTED", "NOT_DELIVERED"],
    ["Módulo A", 0.6, "Funcionalidade 2", 0.5, "NOT_STARTED", "NOT_DELIVERED"],
    ["Módulo B", 0.4, "Funcionalidade X", 1, "", ""]
  ];

  const wb = XLSX.utils.book_new();
  const wsI = XLSX.utils.aoa_to_sheet(instr);
  const wsD = XLSX.utils.aoa_to_sheet(dataSheet);
  XLSX.utils.book_append_sheet(wb, wsI, "Instrucoes");
  XLSX.utils.book_append_sheet(wb, wsD, "Dados");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Lê a planilha e devolve linhas válidas (1-based sourceRow = linha no Excel). */
export function parseContractStructureExcel(buffer: Buffer): ContractStructureImportRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const name =
    wb.SheetNames.find((n) => stripAccents(n).trim().toLowerCase() === "dados") ??
    wb.SheetNames.find((n) => stripAccents(n).trim().toLowerCase() === "datos");
  const sheetName = name ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    throw new Error("Não foi possível ler a folha de dados.");
  }
  const rows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false
  }) as unknown[][];

  if (!rows.length) {
    throw new Error("A folha está vazia.");
  }

  const headerRow = rows[0] ?? [];
  const col: Record<string, number> = {};
  for (let c = 0; c < headerRow.length; c++) {
    const canon = canonicalHeader(headerRow[c] ?? "");
    if (canon) col[canon] = c;
  }
  const required = ["modulo_nome", "modulo_peso", "funcionalidade_nome", "funcionalidade_peso"] as const;
  for (const k of required) {
    if (col[k] === undefined) {
      throw new Error(`Cabeçalho ausente: «${k}». Use o modelo baixado na aplicativo.`);
    }
  }

  const out: ContractStructureImportRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const excelRow = i + 1;
    const r = rows[i] ?? [];
    const modName = String(r[col.modulo_nome] ?? "").trim();
    const featName = String(r[col.funcionalidade_nome] ?? "").trim();
    if (!modName && !featName) continue;
    const mw = parseDecimalCell(r[col.modulo_peso]);
    const fw = parseDecimalCell(r[col.funcionalidade_peso]);
    if (!modName) {
      errors.push(`Linha ${excelRow}: modulo_nome ausente.`);
      continue;
    }
    if (mw === null || mw < 0) {
      errors.push(`Linha ${excelRow}: modulo_peso inválido.`);
      continue;
    }
    if (!featName) {
      errors.push(`Linha ${excelRow}: funcionalidade_nome ausente.`);
      continue;
    }
    if (fw === null || fw < 0) {
      errors.push(`Linha ${excelRow}: funcionalidade_peso inválido.`);
      continue;
    }
    const st = col.funcionalidade_status !== undefined ? parseStatus(r[col.funcionalidade_status]) : undefined;
    const dl = col.funcionalidade_entrega !== undefined ? parseDelivery(r[col.funcionalidade_entrega]) : undefined;
    if (String(r[col.funcionalidade_status] ?? "").trim() && !st) {
      errors.push(`Linha ${excelRow}: funcionalidade_status não reconhecido.`);
      continue;
    }
    if (String(r[col.funcionalidade_entrega] ?? "").trim() && !dl) {
      errors.push(`Linha ${excelRow}: funcionalidade_entrega não reconhecido.`);
      continue;
    }
    out.push({
      moduleName: modName,
      moduleWeight: mw,
      featureName: featName,
      featureWeight: fw,
      featureStatus: st,
      featureDelivery: dl,
      sourceRow: excelRow
    });
  }

  if (errors.length) {
    const head = errors.slice(0, 8).join(" ");
    const more = errors.length > 8 ? ` (+${errors.length - 8} mais)` : "";
    throw new Error(head + more);
  }
  return out;
}
