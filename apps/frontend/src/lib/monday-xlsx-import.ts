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

function parseEffort(raw: string): number | null {
  if (!raw) return null;
  const s = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
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
  const title = pickCell(row, ["Name", "Nome", "Título", "Titulo"]).trim();
  if (!title) return null;
  const status = pickCell(row, ["Status"]);
  const assigneeExternal = pickCell(row, ["Pessoa", "Person", "Responsável", "Responsavel"]);
  const dueRaw = pickCell(row, ["Data", "Prazo", "Due Date", "Due date"]);
  const description = pickCell(row, ["Observação", "Observacao", "Description", "Descrição", "Descricao"]);
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

function sheetRowsToTasks(rows: Record<string, unknown>[]): MondayImportTaskNode[] {
  if (!rows.length) return [];
  const first = rows[0];
  const keys = Object.keys(first);
  const looksHeader = keys.some((k) => {
    const n = normKey(k);
    return n === "name" || n === "nome" || n === "titulo" || n === "título";
  });
  const dataRows = looksHeader ? rows.slice(1) : rows;
  return dataRows.map((r) => rowToTask(r)).filter((t): t is MondayImportTaskNode => t != null);
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

/**
 * Lê um ficheiro Excel exportado do Monday.com (estrutura com colunas indicadas).
 * - Cada **folha** do livro vira um **grupo** (kanban).
 * - Se existir apenas uma folha e coluna **Grupo** / **Group**, agrupa linhas por esse valor.
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
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
    if (!rows.length) {
      return { name: baseName, groups: [{ name: sheets[0], tasks: [] }] };
    }
    if (hasGroupColumn(rows[0])) {
      const map = new Map<string, MondayImportTaskNode[]>();
      const keys0 = Object.keys(rows[0]);
      const headerLike = keys0.some((k) => {
        const n = normKey(k);
        return n === "name" || n === "nome" || n === "titulo" || n === "título";
      });
      const body = headerLike ? rows.slice(1) : rows;
      for (const row of body) {
        const g = pickGroupName(row);
        const t = rowToTask(row);
        if (!t) continue;
        const list = map.get(g) ?? [];
        list.push(t);
        map.set(g, list);
      }
      const groups: MondayImportGroup[] = [...map.entries()].map(([name, tasks]) => ({ name, tasks }));
      return { name: baseName, groups: groups.length ? groups : [{ name: "Geral", tasks: [] }] };
    }

    const tasks = sheetRowsToTasks(rows);
    return { name: baseName, groups: [{ name: sheets[0], tasks }] };
  }

  const groups: MondayImportGroup[] = sheets.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
    const tasks = sheetRowsToTasks(rows);
    return { name: sheetName.trim() || "Grupo", tasks };
  });

  return { name: baseName, groups };
}
