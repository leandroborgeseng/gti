import { HttpException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/jwt-config";
import { sendWelcomePasswordEmail } from "@/lib/password-reset";
import { requestActorStore } from "@gestao/common/audit-actor";
import {
  ensureGoalsBootstrapped,
  gestaoContracts,
  gestaoDashboard,
  gestaoExports,
  gestaoFiscais,
  gestaoGlosas,
  gestaoGoals,
  gestaoGovernance,
  gestaoMeasurements,
  gestaoMonthlyClosureReport,
  gestaoOperationalEvents,
  gestaoProjects,
  gestaoSuppliers,
  gestaoUsers
} from "./gestao-services";
import { loadContractGlpiGroupCatalog } from "./contract-glpi-groups-catalog";

type JwtUser = { sub: string; email: string; role: UserRole; mustChangePassword: boolean };

async function readJsonBody(req: Request): Promise<unknown> {
  const m = req.method.toUpperCase();
  if (m !== "POST" && m !== "PUT" && m !== "PATCH") return undefined;
  let text = "";
  try {
    text = await req.text();
  } catch {
    return undefined;
  }
  const trim = text.trim();
  if (!trim) return undefined;
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  const looksJson = trim.startsWith("{") || trim.startsWith("[");
  if (!ct.includes("application/json") && !ct.includes("text/json") && !looksJson) {
    return undefined;
  }
  try {
    return JSON.parse(trim) as unknown;
  } catch {
    return undefined;
  }
}

async function requireUser(req: Request): Promise<JwtUser | null> {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecretBytes());
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const role = payload.role as UserRole;
    if (!sub || !email || !role) return null;
    const { prisma } = await import("@/glpi/config/prisma");
    const user = await prisma.user.findUnique({ where: { id: sub } });
    if (!user || user.email !== email) return null;
    return { sub: user.id, email: user.email, role: user.role as UserRole, mustChangePassword: user.mustChangePassword };
  } catch {
    return null;
  }
}

function assertRoles(user: JwtUser, roles: UserRole[]): void {
  if (!roles.length) return;
  if (!roles.includes(user.role)) {
    throw new HttpException("Sem permissão para esta operação", 403);
  }
}

/** Bloqueia VIEWER em POST/PUT/PATCH/DELETE (paridade com RolesGuard do Nest). */
function assertMutation(user: JwtUser, method: string): void {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return;
  if (user.role === UserRole.VIEWER) {
    throw new HttpException("Perfil apenas de leitura não pode alterar dados", 403);
  }
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.EDITOR) {
    throw new HttpException("Sem permissão para esta operação", 403);
  }
}

function jsonOk(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

function jsonErr(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message, message }, { status });
}

function xlsxAttachment(buffer: Buffer, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "'")}"`
    }
  });
}

function uploadMaxBytes(): number {
  const n = Number(process.env.UPLOAD_MAX_MB ?? "10");
  return (Number.isFinite(n) && n > 0 ? n : 10) * 1024 * 1024;
}

async function multerLikeFromFile(file: File): Promise<Express.Multer.File> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    fieldname: "file",
    originalname: file.name,
    encoding: "7bit",
    mimetype: file.type || "application/octet-stream",
    buffer,
    size: buffer.length
  } as Express.Multer.File;
}

/**
 * API de gestão contratual (antes no Nest): executa no mesmo processo Next.
 */
export async function dispatchGestaoApi(req: Request, pathSegments: string[]): Promise<Response> {
  const method = req.method.toUpperCase();
  const seg = pathSegments.filter(Boolean);

  if (seg[0] === "auth" && seg[1] === "me" && method === "GET") {
    const user = await requireUser(req);
    if (!user) return jsonErr(401, "Não autenticado");
    return jsonOk({ id: user.sub, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword });
  }

  const user = await requireUser(req);
  if (!user) return jsonErr(401, "Não autenticado");

  const actor = { userId: user.sub, email: user.email, role: user.role };

  requestActorStore.enterWith(actor);
  try {
    return await routeWithUser(req, method, seg, user);
  } catch (e) {
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const msg = e.message;
      return NextResponse.json({ error: msg, message: msg }, { status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[gestao-dispatch]", e);
    return jsonErr(500, msg);
  }
}

async function routeWithUser(req: Request, method: string, seg: string[], user: JwtUser): Promise<Response> {
  const root = seg[0];

  if (root === "dashboard") {
    if (seg[1] === "summary" && method === "GET") return jsonOk(await gestaoDashboard.summary());
    if (seg[1] === "alerts" && method === "GET") return jsonOk(await gestaoDashboard.alerts());
    if (seg[1] === "notifications" && method === "GET") return jsonOk(await gestaoDashboard.notificationsPlaceholder());
    return jsonErr(404, "Não encontrado");
  }

  if (root === "operational-summary") {
    if (seg.length === 1 && method === "GET") {
      const u = new URL(req.url);
      return jsonOk(
        await gestaoOperationalEvents.summary({
          preset: (u.searchParams.get("preset") ?? undefined) as never,
          from: u.searchParams.get("from"),
          to: u.searchParams.get("to")
        })
      );
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "contracts") {
    if (seg.length === 3 && seg[1] === "catalog" && seg[2] === "glpi-assigned-groups" && method === "GET") {
      return jsonOk(await loadContractGlpiGroupCatalog());
    }
    if (seg.length === 3 && seg[1] === "overview" && seg[2] === "modules-delivery" && method === "GET") {
      return jsonOk(await gestaoContracts.findModulesDeliveryOverview());
    }
    if (seg.length === 1 && method === "GET") return jsonOk(await gestaoContracts.findAll());
    if (seg.length === 1 && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoContracts.create((await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && method === "GET") return jsonOk(await gestaoContracts.findOne(seg[1]));
    if (seg.length === 2 && method === "PUT") {
      assertMutation(user, method);
      return jsonOk(await gestaoContracts.update(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "modules" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoContracts.createModule(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 4 && seg[2] === "modules" && method === "PUT") {
      assertMutation(user, method);
      return jsonOk(await gestaoContracts.updateModule(seg[1], seg[3], (await readJsonBody(req)) as never));
    }
    if (seg.length === 4 && seg[2] === "modules" && method === "DELETE") {
      assertMutation(user, method);
      return jsonOk(await gestaoContracts.deleteModule(seg[1], seg[3]));
    }
    if (seg.length === 5 && seg[2] === "modules" && seg[4] === "features" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoContracts.createFeature(seg[1], seg[3], (await readJsonBody(req)) as never));
    }
    if (seg.length === 6 && seg[2] === "modules" && seg[4] === "features" && method === "PUT") {
      assertMutation(user, method);
      return jsonOk(await gestaoContracts.updateFeature(seg[1], seg[3], seg[5], (await readJsonBody(req)) as never));
    }
    if (seg.length === 6 && seg[2] === "modules" && seg[4] === "features" && method === "DELETE") {
      assertMutation(user, method);
      return jsonOk(await gestaoContracts.deleteFeature(seg[1], seg[3], seg[5]));
    }
    if (seg.length === 3 && seg[2] === "services" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoContracts.createService(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 5 && seg[2] === "services" && method === "PUT") {
      assertMutation(user, method);
      return jsonOk(await gestaoContracts.updateService(seg[1], seg[3], (await readJsonBody(req)) as never));
    }
    if (seg.length === 5 && seg[2] === "services" && method === "DELETE") {
      assertMutation(user, method);
      return jsonOk(await gestaoContracts.deleteService(seg[1], seg[3]));
    }
    if (seg.length === 3 && seg[2] === "amendments" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoContracts.createAmendment(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "financial-snapshots" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoContracts.createFinancialSnapshot(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "structure-template.xlsx" && method === "GET") {
      const { prisma } = await import("@/glpi/config/prisma");
      const c = await prisma.contract.findFirst({
        where: { id: seg[1], deletedAt: null },
        select: { number: true }
      });
      if (!c) return jsonErr(404, "Contrato não encontrado");
      const { buildContractStructureTemplateBuffer } = await import("./contract-structure-xlsx");
      const buf = buildContractStructureTemplateBuffer(c.number);
      const fn = `modelo-modulos-funcionalidades-${c.number.replace(/[^\w.-]+/g, "_")}.xlsx`;
      return xlsxAttachment(buf, fn);
    }
    if (seg.length === 3 && seg[2] === "structure-import" && method === "POST") {
      assertMutation(user, method);
      const form = await req.formData();
      const file = form.get("file");
      const replace = String(form.get("replace") ?? "").toLowerCase() === "true";
      if (!(file instanceof File)) return jsonErr(400, "Arquivo ausente (campo file).");
      if (file.size > uploadMaxBytes()) return jsonErr(400, "Arquivo demasiado grande");
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const { parseContractStructureExcel } = await import("./contract-structure-xlsx");
        const rows = parseContractStructureExcel(buffer);
        return jsonOk(await gestaoContracts.importModulesAndFeatures(seg[1], rows, { replace }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonErr(400, msg);
      }
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "measurements") {
    if (seg.length === 1 && method === "GET") return jsonOk(await gestaoMeasurements.findAll());
    if (seg.length === 1 && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoMeasurements.create((await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "items" && method === "POST") {
      assertMutation(user, method);
      const body = (await readJsonBody(req)) as { items?: unknown };
      return jsonOk(await gestaoMeasurements.addItems(seg[1], (body?.items ?? []) as never));
    }
    if (seg.length === 5 && seg[2] === "items" && method === "DELETE") {
      assertMutation(user, method);
      return jsonOk(await gestaoMeasurements.removeItem(seg[1], seg[3]));
    }
    if (seg.length === 5 && seg[2] === "items" && method === "PATCH") {
      assertMutation(user, method);
      const body = (await readJsonBody(req)) as { quantity?: unknown };
      return jsonOk(await gestaoMeasurements.patchItem(seg[1], seg[3], body?.quantity as never));
    }
    if (seg.length === 4 && seg[2] === "calculate" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoMeasurements.calculate(seg[1]));
    }
    if (seg.length === 4 && seg[2] === "approve" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoMeasurements.approve(seg[1]));
    }
    if (seg.length === 4 && seg[2] === "attachments" && method === "POST") {
      assertMutation(user, method);
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return jsonErr(400, "Arquivo ausente");
      if (file.size > uploadMaxBytes()) return jsonErr(400, "Arquivo demasiado grande");
      return jsonOk(await gestaoMeasurements.addAttachmentUpload(seg[1], await multerLikeFromFile(file)));
    }
    if (seg.length === 2 && method === "GET") return jsonOk(await gestaoMeasurements.findOne(seg[1]));
    return jsonErr(404, "Não encontrado");
  }

  if (root === "glosas") {
    if (seg.length === 1 && method === "GET") return jsonOk(await gestaoGlosas.findAll());
    if (seg.length === 1 && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoGlosas.create((await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && method === "GET") return jsonOk(await gestaoGlosas.findOne(seg[1]));
    if (seg.length === 4 && seg[2] === "attachments" && method === "POST") {
      assertMutation(user, method);
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return jsonErr(400, "Arquivo ausente");
      if (file.size > uploadMaxBytes()) return jsonErr(400, "Arquivo demasiado grande");
      return jsonOk(await gestaoGlosas.addAttachmentUpload(seg[1], await multerLikeFromFile(file)));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "suppliers") {
    if (seg.length === 1 && method === "GET") return jsonOk(await gestaoSuppliers.findAll());
    if (seg.length === 1 && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoSuppliers.create((await readJsonBody(req)) as never));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "fiscais") {
    if (seg.length === 1 && method === "GET") return jsonOk(await gestaoFiscais.findAll());
    if (seg.length === 1 && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoFiscais.create((await readJsonBody(req)) as never));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "users") {
    assertRoles(user, [UserRole.ADMIN]);
    if (seg.length === 1 && method === "GET") return jsonOk(await gestaoUsers.findAll());
    if (seg.length === 1 && method === "POST") {
      assertMutation(user, method);
      const created = await gestaoUsers.create((await readJsonBody(req)) as never);
      sendWelcomePasswordEmail(created).catch((e) => {
        console.error("[users] falha ao enviar e-mail de boas-vindas", e);
      });
      return jsonOk(created);
    }
    if (seg.length === 2 && method === "PATCH") {
      assertMutation(user, method);
      return jsonOk(await gestaoUsers.update(seg[1], (await readJsonBody(req)) as never));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "reports") {
    if (seg.length === 2 && seg[1] === "monthly-contract-closure" && method === "GET") {
      const u = new URL(req.url);
      const y = Number(u.searchParams.get("year"));
      const m = Number(u.searchParams.get("month"));
      if (!Number.isFinite(y) || !Number.isFinite(m)) {
        return jsonErr(400, "Parâmetros year e month são obrigatórios (ex.: ?year=2026&month=4).");
      }
      return jsonOk(await gestaoMonthlyClosureReport.build(Math.floor(y), Math.floor(m)));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "exports") {
    assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
    const csv = (body: string, name: string) =>
      new NextResponse(`\ufeff${body}`, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}"`
        }
      });
    if (seg[1] === "contracts.csv" && method === "GET") return csv(await gestaoExports.contractsCsv(), "contratos.csv");
    if (seg[1] === "measurements.csv" && method === "GET") return csv(await gestaoExports.measurementsCsv(), "medicoes.csv");
    if (seg[1] === "contract-amendments.csv" && method === "GET") return csv(await gestaoExports.contractAmendmentsCsv(), "aditivos-contratos.csv");
    if (seg[1] === "glosas.csv" && method === "GET") return csv(await gestaoExports.glosasCsv(), "glosas.csv");
    return jsonErr(404, "Não encontrado");
  }

  if (root === "projects") {
    if (seg.length === 1 && method === "GET") return jsonOk(await gestaoProjects.findAll());
    if (seg.length === 2 && seg[1] === "supervisors" && method === "GET") return jsonOk(await gestaoProjects.findSupervisors());
    if (seg.length === 2 && seg[1] === "groups" && method === "GET") return jsonOk(await gestaoProjects.findCollections());
    if (seg.length === 2 && seg[1] === "groups" && method === "POST") {
      assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
      assertMutation(user, method);
      const body = await readJsonBody(req);
      if (body == null || typeof body !== "object") {
        return jsonErr(400, "Corpo JSON inválido ou ausente. Use Content-Type: application/json.");
      }
      return jsonOk(await gestaoProjects.createCollection(body as never));
    }
    if (seg.length === 3 && seg[1] === "groups" && method === "PATCH") {
      assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
      assertMutation(user, method);
      const body = await readJsonBody(req);
      if (body == null || typeof body !== "object") {
        return jsonErr(400, "Corpo JSON inválido ou ausente. Use Content-Type: application/json.");
      }
      return jsonOk(await gestaoProjects.updateCollection(seg[2], body as never));
    }
    if (seg.length === 3 && seg[1] === "groups" && method === "DELETE") {
      assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
      assertMutation(user, method);
      return jsonOk(await gestaoProjects.deleteCollection(seg[2]));
    }
    if (seg.length === 1 && method === "POST") {
      assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
      assertMutation(user, method);
      const body = await readJsonBody(req);
      if (body == null || typeof body !== "object") {
        return jsonErr(400, "Corpo JSON inválido ou ausente. Use Content-Type: application/json.");
      }
      return jsonOk(await gestaoProjects.create(body as never));
    }
    if (seg.length === 2 && seg[1] === "monday-import" && method === "POST") {
      assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
      assertMutation(user, method);
      const body = await readJsonBody(req);
      if (body == null || typeof body !== "object") {
        return jsonErr(400, "Corpo JSON inválido ou ausente. Use Content-Type: application/json.");
      }
      return jsonOk(await gestaoProjects.importFromMonday(body));
    }
    if (seg.length === 4 && seg[2] === "tasks" && method === "PATCH") {
      assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
      assertMutation(user, method);
      const body = await readJsonBody(req);
      if (body == null || typeof body !== "object") {
        return jsonErr(400, "Corpo JSON inválido ou ausente. Use Content-Type: application/json.");
      }
      return jsonOk(await gestaoProjects.updateTask(seg[1], seg[3], body as never));
    }
    if (seg.length === 4 && seg[2] === "tasks" && method === "DELETE") {
      assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
      assertMutation(user, method);
      return jsonOk(await gestaoProjects.deleteTask(seg[1], seg[3]));
    }
    if (seg.length === 3 && seg[2] === "tasks" && method === "POST") {
      assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
      assertMutation(user, method);
      const body = await readJsonBody(req);
      if (body == null || typeof body !== "object") {
        return jsonErr(400, "Corpo JSON inválido ou ausente. Use Content-Type: application/json.");
      }
      return jsonOk(await gestaoProjects.createTask(seg[1], body as never));
    }
    if (seg.length === 5 && seg[2] === "tasks" && seg[4] === "attachments" && method === "POST") {
      assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
      assertMutation(user, method);
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return jsonErr(400, "Arquivo ausente");
      if (file.size > uploadMaxBytes()) return jsonErr(400, "Arquivo demasiado grande");
      return jsonOk(await gestaoProjects.addTaskAttachment(seg[1], seg[3], await multerLikeFromFile(file)));
    }
    if (seg.length === 2 && method === "DELETE") {
      assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
      assertMutation(user, method);
      return jsonOk(await gestaoProjects.delete(seg[1]));
    }
    if (seg.length === 2 && method === "PATCH") {
      assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
      assertMutation(user, method);
      const body = await readJsonBody(req);
      if (body == null || typeof body !== "object") {
        return jsonErr(400, "Corpo JSON inválido ou ausente. Use Content-Type: application/json.");
      }
      return jsonOk(await gestaoProjects.update(seg[1], body as never));
    }
    if (seg.length === 2 && seg[1] === "dashboard" && method === "GET") {
      return jsonOk(await gestaoProjects.dashboardStats());
    }
    if (seg.length === 2 && seg[1] === "tasks" && method === "GET") {
      const u = new URL(req.url);
      return jsonOk(await gestaoProjects.findAllTasksFlat(Object.fromEntries(u.searchParams.entries())));
    }
    if (seg.length === 3 && seg[1] === "tasks" && seg[2] === "bulk" && method === "PATCH") {
      assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
      assertMutation(user, method);
      const body = await readJsonBody(req);
      if (body == null || typeof body !== "object") {
        return jsonErr(400, "Corpo JSON inválido ou ausente. Use Content-Type: application/json.");
      }
      return jsonOk(await gestaoProjects.bulkPatchTasks(body));
    }
    if (seg.length === 2 && method === "GET") return jsonOk(await gestaoProjects.findOne(seg[1]));
    return jsonErr(404, "Não encontrado");
  }

  if (root === "goals") {
    await ensureGoalsBootstrapped();
    if (seg.length === 1 && method === "GET") return jsonOk(await gestaoGoals.findAll());
    if (seg.length === 1 && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoGoals.create((await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && seg[1] === "dashboard" && method === "GET") return jsonOk(await gestaoGoals.dashboard());
    if (seg.length === 2 && method === "GET") return jsonOk(await gestaoGoals.findOne(seg[1]));
    if (seg.length === 2 && method === "PUT") {
      assertMutation(user, method);
      return jsonOk(await gestaoGoals.update(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 4 && seg[2] === "actions" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoGoals.addAction(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 4 && seg[2] === "actions" && method === "PUT") {
      assertMutation(user, method);
      return jsonOk(await gestaoGoals.updateAction(seg[1], seg[3], (await readJsonBody(req)) as never));
    }
    if (seg.length === 4 && seg[2] === "manual-progress" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoGoals.setManualProgress(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 4 && seg[2] === "links" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoGoals.link(seg[1], (await readJsonBody(req)) as never));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "governance" && seg[1] === "tickets") {
    const t = seg.slice(2);
    if (t.length === 0 && method === "GET") return jsonOk(await gestaoGovernance.findAll());
    if (t.length === 0 && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoGovernance.create((await readJsonBody(req)) as never));
    }
    if (t.length === 1 && t[0] === "notifications" && method === "GET") return jsonOk(await gestaoGovernance.notifications());
    if (t.length === 2 && t[0] === "monitoring" && t[1] === "run" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoGovernance.runMonitoring());
    }
    if (t.length === 1 && method === "GET") return jsonOk(await gestaoGovernance.findOne(t[0]));
    if (t.length === 2 && t[1] === "acknowledge" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoGovernance.acknowledge(t[0], (await readJsonBody(req)) as never));
    }
    if (t.length === 2 && t[1] === "classify" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoGovernance.classify(t[0], (await readJsonBody(req)) as never));
    }
    if (t.length === 2 && t[1] === "resolve" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoGovernance.setResolved(t[0], (await readJsonBody(req)) as never));
    }
    if (t.length === 2 && t[1] === "notify-manager" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoGovernance.notifyManager(t[0], (await readJsonBody(req)) as never));
    }
    if (t.length === 2 && t[1] === "extend-deadline" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoGovernance.extendDeadline(t[0], (await readJsonBody(req)) as never));
    }
    if (t.length === 2 && t[1] === "watchers" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoGovernance.addWatcher(t[0], (await readJsonBody(req)) as never));
    }
    if (t.length === 2 && t[1] === "send-to-controladoria" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoGovernance.sendToControladoria(t[0], (await readJsonBody(req)) as never));
    }
    return jsonErr(404, "Não encontrado");
  }

  return jsonErr(404, "Não encontrado");
}
