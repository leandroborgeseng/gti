import * as XLSX from "xlsx";

/** Payload alinhado ao `POST /api/projects/monday-import` (Nest). */
export type MondayImportTaskNode = {
  title: string;
  status?: string;
  assigneeExternal?: string;
  dueDate?: string | null;
  description?: string;
  effort?: number | null;
  internalResponsible?: string;
  children?: MondayImportTaskNode[];
};

export type MondayImportGroup = {
  name: string;
  tasks: MondayImportTaskNode[];
};

export type MondayImportPayload = {
  name: string;
  groups: MondayImportGroup[];
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function normKey(s: string): string {
  return stripAccents(String(s).trim().toLowerCase()).replace(/\s+/g, " ");
}

/** Cabeçalhos típicos de exportação Monday (normalizados). */
const MONDAY_HEADER_TOKENS = new Set([
  "name",
  "nome",
  "titulo",
  "título",
  "status",
  "pessoa",
  "person",
  "owner",
  "data",
  "date",
  "prazo",
  "due date",
  "subelementos",
  "subelementos status",
  "observação",
  "observacao",
  "description",
  "números",
  "numeros",
  "numbers",
  "resp. pmf",
  "arquivos",
  "item id (auto generated)",
  "subtasks",
  "descr. da tarefa:",
  "subitems"
]);

function looksLikeMondayHeaderRow(row: unknown[]): boolean {
  let hits = 0;
  let hasName = false;
  let hasStatus = false;
  for (const cell of row) {
    const n = normKey(String(cell ?? ""));
    if (n === "name" || n === "nome" || n === "titulo" || n === "título") hasName = true;
    if (n === "status") hasStatus = true;
    if (MONDAY_HEADER_TOKENS.has(n)) hits++;
  }
  return (hasName && hasStatus) || hits >= 4;
}

/** Linha de secção (ex.: nome do grupo) antes da tabela — só uma célula preenchida. */
function isGroupBannerRow(row: unknown[]): boolean {
  if (looksLikeMondayHeaderRow(row)) return false;
  const parts = row.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (parts.length !== 1) return false;
  const t = parts[0];
  if (t.length < 8) return false;
  if (/^\d+$/.test(t)) return false;
  const n = normKey(t);
  if (["feito", "em progresso", "em andamento", "parado", "concluído", "não iniciado", "nao iniciado"].includes(n)) {
    return false;
  }
  return true;
}

function sheetToMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
}

function rowWidth(row: unknown[]): number {
  let w = row.length;
  while (w > 0 && String(row[w - 1] ?? "").trim() === "") {
    w--;
  }
  return Math.max(w, 0);
}

/** Junta uma linha de dados aos nomes de coluna do cabeçalho activo. */
function zipHeaderToRow(headerRow: unknown[], dataRow: unknown[]): Record<string, unknown> {
  const w = Math.max(rowWidth(headerRow), rowWidth(dataRow));
  const o: Record<string, unknown> = {};
  const used = new Map<string, number>();
  for (let c = 0; c < w; c++) {
    const rawKey = String(headerRow[c] ?? "").trim();
    if (!rawKey) continue;
    let key = rawKey;
    const prev = used.get(rawKey) ?? 0;
    if (prev > 0 || o[key] !== undefined) {
      const n = prev + 1;
      used.set(rawKey, n);
      key = `${rawKey} (${n})`;
    } else {
      used.set(rawKey, 1);
    }
    o[key] = dataRow[c] ?? "";
  }
  return o;
}

function isRowEffectivelyEmpty(row: unknown[]): boolean {
  return !row.some((c) => String(c ?? "").trim());
}

/**
 * Converte a grelha do Excel em registos com chaves = cabeçalhos Monday reais.
 * Ignora linhas introdutórias; detecta cabeçalhos intermédios (ex.: bloco Subitems);
 * linhas só com título de grupo preenchem o campo virtual Grupo nas linhas seguintes.
 */
function matrixToRecordsFrom(matrix: unknown[][], hdrIdx: number): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let activeHeader = matrix[hdrIdx] ?? [];
  let currentGroup = "";

  for (let i = hdrIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    if (isRowEffectivelyEmpty(row)) continue;

    if (looksLikeMondayHeaderRow(row)) {
      activeHeader = row;
      currentGroup = "";
      continue;
    }

    if (isGroupBannerRow(row)) {
      currentGroup = String(row.find((c) => String(c ?? "").trim()) ?? "").trim();
      continue;
    }

    const o = zipHeaderToRow(activeHeader, row);
    if (currentGroup) {
      o["Grupo"] = currentGroup;
    }
    out.push(o);
  }

  return out;
}

function findMondayHeaderRowIndex(matrix: unknown[][]): number {
  for (let i = 0; i < Math.min(matrix.length, 500); i++) {
    if (looksLikeMondayHeaderRow(matrix[i] ?? [])) return i;
  }
  return -1;
}

function sheetToLogicalRecords(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const matrix = sheetToMatrix(sheet);
  const hdrIdx = findMondayHeaderRowIndex(matrix);
  if (hdrIdx < 0) {
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  }
  return matrixToRecordsFrom(matrix, hdrIdx);
}

/** Encontra o valor da primeira coluna cujo cabeçalho case-insensitive coincide com algum alias. */
function pickCell(row: Record<string, unknown>, aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const want = normKey(alias);
    for (const k of keys) {
      if (normKey(k) === want) {
        const v = row[k];
        if (v == null) return "";
        if (v instanceof Date) return v.toISOString();
        return String(v).trim();
      }
    }
  }
  return "";
}

function splitList(raw: string): string[] {
  if (!raw) return [];
  const parts = raw.split(/\r?\n|;(?=\s*[^\s])/);
  const out: string[] = [];
  for (const p of parts) {
    const t = p.replace(/^[,;\s]+|[,;\s]+$/g, "").trim();
    if (t) out.push(t);
  }
  return out;
}

/** Número exportado pelo Monday (vírgula decimal PT ou ponto decimal EN; pontos como milhares). */
function parseEffort(raw: string): number | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    s =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  } else {
    const parts = s.split(".");
    if (parts.length > 2) {
      s = parts.join("");
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDue(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

function rowToTask(row: Record<string, unknown>): MondayImportTaskNode | null {
  const title = pickCell(row, ["Name", "Nome", "Título", "Titulo", "Item"]).trim();
  if (!title) return null;
  const status = pickCell(row, ["Status"]);
  const assigneeExternal = pickCell(row, ["Pessoa", "Person", "Responsável", "Responsavel", "Owner"]);
  const dueRaw = pickCell(row, ["Data", "Prazo", "Due Date", "Due date", "Date"]);
  const description = pickCell(row, [
    "Observação",
    "Observacao",
    "Description",
    "Descrição",
    "Descricao",
    "Descr. da tarefa:"
  ]);
  const subNames = splitList(pickCell(row, ["Subelementos", "Sub-elementos", "Subtarefas", "Subtasks"]));
  const subStatus = splitList(pickCell(row, ["Subelementos Status", "Subelementos status", "Status subtarefas"]));
  const effort = parseEffort(pickCell(row, ["Números", "Numeros", "Numbers", "Esforço", "Esforco"]));
  const internalResponsible = pickCell(row, ["Resp. PMF", "Resp PMF", "Responsável PMF", "PMF"]);

  const children: MondayImportTaskNode[] = [];
  for (let i = 0; i < subNames.length; i++) {
    children.push({
      title: subNames[i],
      status: subStatus[i] ?? "",
      assigneeExternal: undefined,
      dueDate: null,
      description: undefined,
      effort: null,
      internalResponsible: undefined
    });
  }

  return {
    title,
    status,
    assigneeExternal: assigneeExternal || undefined,
    dueDate: parseDue(dueRaw),
    description: description || undefined,
    effort,
    internalResponsible: internalResponsible || undefined,
    children: children.length ? children : undefined
  };
}

function recordsToTasks(rows: Record<string, unknown>[]): MondayImportTaskNode[] {
  return rows.map((r) => rowToTask(r)).filter((t): t is MondayImportTaskNode => t != null);
}

function hasGroupColumn(sampleRow: Record<string, unknown>): boolean {
  return Object.keys(sampleRow).some((k) => {
    const n = normKey(k);
    return n === "grupo" || n === "group" || n === "bloco" || n === "lista";
  });
}

function pickGroupName(row: Record<string, unknown>): string {
  const g =
    pickCell(row, ["Grupo", "Group", "Bloco", "Lista"]) ||
    pickCell(row, ["Grupo / Lista", "Group / Board"]);
  return g.trim() || "Geral";
}

function groupsFromRecords(records: Record<string, unknown>[], defaultName: string): MondayImportGroup[] {
  if (!records.length) {
    return [{ name: defaultName, tasks: [] }];
  }
  const map = new Map<string, MondayImportTaskNode[]>();
  for (const row of records) {
    const g = pickGroupName(row);
    const t = rowToTask(row);
    if (!t) continue;
    const list = map.get(g) ?? [];
    list.push(t);
    map.set(g, list);
  }
  const groups: MondayImportGroup[] = [...map.entries()].map(([name, tasks]) => ({ name, tasks }));
  return groups.length ? groups : [{ name: "Geral", tasks: [] }];
}

/**
 * Lê um ficheiro Excel exportado do Monday.com (estrutura com colunas indicadas).
 * - Cada **folha** do livro vira um **grupo** (kanban).
 * - Se existir apenas uma folha e coluna **Grupo** / **Group**, agrupa linhas por esse valor.
 * - Suporta folhas com **linhas introdutórias** antes do cabeçalho real (Name, Status, …) e **linhas de grupo** (uma célula) injectadas como coluna Grupo.
 */
export function parseMondayExportWorkbook(buffer: ArrayBuffer, fileName: string): MondayImportPayload {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, dense: false });
  const baseName = fileName.replace(/\.(xlsx|xls|xlsm)$/i, "").trim() || "Projeto importado";

  const sheets = workbook.SheetNames.filter((n) => !n.startsWith("__"));
  if (sheets.length === 0) {
    return { name: baseName, groups: [{ name: "Geral", tasks: [] }] };
  }

  if (sheets.length === 1) {
    const sheet = workbook.Sheets[sheets[0]];
    const records = sheetToLogicalRecords(sheet);
    if (!records.length) {
      return { name: baseName, groups: [{ name: sheets[0], tasks: [] }] };
    }
    if (hasGroupColumn(records[0])) {
      return { name: baseName, groups: groupsFromRecords(records, sheets[0]) };
    }
    const tasks = recordsToTasks(records);
    return { name: baseName, groups: [{ name: sheets[0], tasks }] };
  }

  const groups: MondayImportGroup[] = [];
  for (const sheetName of sheets) {
    const sheet = workbook.Sheets[sheetName];
    const records = sheetToLogicalRecords(sheet);
    if (!records.length) {
      groups.push({ name: sheetName.trim() || "Grupo", tasks: [] });
      continue;
    }
    if (hasGroupColumn(records[0])) {
      groups.push(...groupsFromRecords(records, sheetName));
    } else {
      groups.push({ name: sheetName.trim() || "Grupo", tasks: recordsToTasks(records) });
    }
  }

  return { name: baseName, groups };
}
