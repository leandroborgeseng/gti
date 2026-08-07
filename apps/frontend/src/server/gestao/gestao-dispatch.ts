import { HttpException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import {
  buildActiveContext,
  loadUserAccessContext,
  resolveAuthMeForUser,
  switchUserAccessContext,
  toRequestActor
} from "@gestao/common/access-context";
import { requestActorStore } from "@gestao/common/audit-actor";
import { issueAuthToken } from "@/lib/auth-issue-token";
import { jwtSecretBytes } from "@/lib/jwt-config";
import { sendWelcomePasswordEmail } from "@/lib/password-reset";
import {
  ensureGoalsBootstrapped,
  gestaoContracts,
  gestaoDashboard,
  gestaoExports,
  gestaoFiscais,
  gestaoGlosas,
  gestaoGoals,
  gestaoGovernance,
  gestaoHiringTypes,
  gestaoMeasurements,
  gestaoMonthlyClosureReport,
  gestaoPricingItemsFinancialReport,
  gestaoOperationalEvents,
  gestaoOrganizations,
  gestaoPermissions,
  gestaoContractTypeCatalog,
  gestaoProjects,
  gestaoSuppliers,
  gestaoUserAccess,
  gestaoUserAssignments,
  gestaoUsers,
  gestaoAuditLogs,
  gestaoDeadlines,
  gestaoNotificationTemplates,
  gestaoContractNotifications
} from "./gestao-services";
import { loadContractGlpiGroupCatalog } from "./contract-glpi-groups-catalog";

type JwtUser = {
  sub: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  profileColor: string | null;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  role: UserRole;
  /** systemKey do perfil ativo (ADMIN|EDITOR|VIEWER|EXTERNAL). */
  systemKey: string | null;
  organizationId: string | null;
  profileId: string | null;
  allOrganizationsActive: boolean;
  mustChangePassword: boolean;
  userKind: "INTERNAL" | "EXTERNAL";
  supplierId: string | null;
  authorizedContractIds: string[];
  effectivePermissionKeys: Set<string>;
  usingLegacyPermissionFallback: boolean;
};

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
    if (!sub || !email) return null;
    const { prisma } = await import("@/glpi/config/prisma");
    const accessUser = await loadUserAccessContext(prisma, sub);
    if (!accessUser || accessUser.email !== email) return null;
    const ctx = buildActiveContext(accessUser);
    if (ctx.organizationId && ctx.organizationLabel === ctx.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { name: true, acronym: true, active: true }
      });
      if (!org?.active) {
        throw new HttpException(
          "O órgão ativo não está mais disponível. Escolha outro contexto ou faça login novamente.",
          403
        );
      }
      ctx.organizationLabel = org.acronym ? `${org.acronym} · ${org.name}` : org.name;
    }
    return {
      sub: accessUser.id,
      email: accessUser.email,
      firstName: accessUser.firstName,
      lastName: accessUser.lastName,
      displayName: accessUser.displayName,
      profileColor: accessUser.profileColor,
      jobTitle: accessUser.jobTitle,
      department: accessUser.department,
      phone: accessUser.phone,
      role: ctx.role,
      systemKey: ctx.systemKey,
      organizationId: ctx.organizationId,
      profileId: ctx.profileId,
      allOrganizationsActive: ctx.allOrganizationsActive,
      mustChangePassword: accessUser.mustChangePassword,
      userKind: accessUser.userKind ?? "INTERNAL",
      supplierId: accessUser.supplierId ?? null,
      authorizedContractIds: (accessUser.externalContracts ?? []).map((c) => c.contractId),
      effectivePermissionKeys: new Set(),
      usingLegacyPermissionFallback: false
    };
  } catch (e) {
    if (e instanceof HttpException) throw e;
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
  // Externos usam role legado VIEWER; mutações próprias são liberadas por permissão na rota.
  if (user.userKind === "EXTERNAL" || user.systemKey === "EXTERNAL") return;
  if (user.role === UserRole.VIEWER) {
    throw new HttpException("Perfil apenas de leitura não pode alterar dados", 403);
  }
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.EDITOR) {
    throw new HttpException("Sem permissão para esta operação", 403);
  }
}

const LEGACY_ROLE_PERMISSION_KEYS: Record<UserRole, readonly string[]> = {
  [UserRole.VIEWER]: [
    "dashboard.view",
    "deadlines.view",
    "contracts.view",
    "contracts.features.view",
    "measurements.view",
    "glosas.view",
    "governance.view",
    "goals.view",
    "projects.view",
    "suppliers.view",
    "fiscais.view",
    "reports.view",
    "manual.view",
    "notifications.view",
    "schedules.view",
    "documents.view",
    "profile.view"
  ],
  [UserRole.EDITOR]: [
    "dashboard.view",
    "deadlines.view",
    "contracts.view",
    "contracts.features.view",
    "measurements.view",
    "glosas.view",
    "governance.view",
    "goals.view",
    "projects.view",
    "suppliers.view",
    "fiscais.view",
    "reports.view",
    "manual.view",
    "contracts.create",
    "contracts.edit",
    "contracts.features.edit_delivery",
    "contracts.features.edit_criticality",
    "measurements.create",
    "measurements.edit",
    "glosas.create",
    "exports.run",
    "projects.edit",
    "notifications.view",
    "notifications.manage",
    "notifications.sign",
    "notifications.send",
    "notifications.analyze",
    "schedules.view",
    "documents.view",
    "profile.view"
  ],
  [UserRole.ADMIN]: []
};

const ADMIN_ONLY_PERMISSION_KEYS = [
  "contracts.delete",
  "contracts.internal_code.regenerate",
  "contracts.financial.view",
  "deadlines.recalculate",
  "controladoria.manage",
  "admin.users.view",
  "admin.users.manage",
  "admin.organs.view",
  "admin.organs.manage",
  "admin.permissions.view",
  "admin.permissions.manage",
  "admin.item_types.view",
  "admin.item_types.manage",
  "admin.contract_types.view",
  "admin.contract_types.manage",
  "admin.hiring_types.view",
  "admin.hiring_types.manage",
  "admin.backup.manage",
  "admin.email.manage",
  "admin.audit.manage",
  "notification_templates.manage"
] as const;

function legacyPermissionKeys(role: UserRole): Set<string> {
  if (role === UserRole.ADMIN) {
    return new Set([...LEGACY_ROLE_PERMISSION_KEYS[UserRole.EDITOR], ...ADMIN_ONLY_PERMISSION_KEYS]);
  }
  return new Set(LEGACY_ROLE_PERMISSION_KEYS[role]);
}

function effectiveKeys(user: JwtUser): Set<string> {
  return user.usingLegacyPermissionFallback ? legacyPermissionKeys(user.role) : user.effectivePermissionKeys;
}

function assertPermission(user: JwtUser, key: string): void {
  if (!effectiveKeys(user).has(key)) {
    throw new HttpException("Sem permissão para esta operação", 403);
  }
}

/** Aceita qualquer uma das chaves (útil para catálogos lidos por formulários operacionais). */
function assertAnyPermission(user: JwtUser, keys: string[]): void {
  const effective = effectiveKeys(user);
  if (!keys.some((key) => effective.has(key))) {
    throw new HttpException("Sem permissão para esta operação", 403);
  }
}

/** Encaminhar ocorrência: controladoria.manage, ou ADMIN com contracts.edit. */
function assertCanForwardToControladoria(user: JwtUser): void {
  const keys = effectiveKeys(user);
  if (keys.has("controladoria.manage")) return;
  if (user.role === UserRole.ADMIN && keys.has("contracts.edit")) return;
  throw new HttpException("Sem permissão para encaminhar à Controladoria", 403);
}

function assertFeatureEditPermissions(user: JwtUser, body: Record<string, unknown>): void {
  const structuralKeys = ["validationGroupId", "responsibleUserIds", "name", "itemCode", "weight", "status"];
  if (structuralKeys.some((k) => k in body)) {
    assertPermission(user, "contracts.edit");
    return;
  }
  let checkedSpecificPermission = false;
  if ("deliveryStatus" in body) {
    assertPermission(user, "contracts.features.edit_delivery");
    checkedSpecificPermission = true;
  }
  if ("criticality" in body) {
    assertPermission(user, "contracts.features.edit_criticality");
    checkedSpecificPermission = true;
  }
  if (!checkedSpecificPermission) {
    assertPermission(user, "contracts.edit");
  }
}

function requiredPermissionForRoute(method: string, seg: string[]): string | null {
  const root = seg[0];
  const isRead = method === "GET" || method === "HEAD";

  if (root === "dashboard") return isRead ? "dashboard.view" : null;
  if (root === "deadlines") {
    if (method === "POST" && seg[1] === "recalculate") return "deadlines.recalculate";
    return isRead ? "deadlines.view" : null;
  }
  if (root === "notification-templates") {
    // Leitura também para quem elabora notificações; escrita só admin (checada na rota).
    if (isRead) return null;
    return "notification_templates.manage";
  }
  if (root === "contract-notifications") {
    if (isRead) return "notifications.view";
    if (seg[2] === "acknowledge" || seg[2] === "response") return "notifications.respond";
    if (seg[2] === "sign") return "notifications.sign";
    if (seg[2] === "prepare-send" || seg[2] === "confirm-send") return "notifications.send";
    if (seg[2] === "analyze" || (seg[3] === "analyze")) return "notifications.analyze";
    return "notifications.manage";
  }
  if (root === "exports") return "exports.run";
  // Leituras de catálogo tratadas em assertCatalogRead (contratos também precisam listar).
  if (root === "organizations") return isRead ? null : "admin.organs.manage";
  if (root === "users") {
    // `/users/options` é usado em selects operacionais (contratos/projetos); permissão checada abaixo.
    if (seg[1] === "options" && isRead) return null;
    return isRead ? "admin.users.view" : "admin.users.manage";
  }
  if (root === "permissions") {
    if (seg[1] === "me") return null;
    return isRead ? "admin.permissions.view" : "admin.permissions.manage";
  }
  if (root === "contract-type-catalog") return isRead ? null : "admin.contract_types.manage";
  if (root === "hiring-types") return isRead ? null : "admin.hiring_types.manage";

  if (root === "contracts") {
    if (seg[1] === "catalog" && seg[2] === "item-types") {
      return isRead ? null : "admin.item_types.manage";
    }
    if (seg.includes("features-delivery") || seg.includes("modules-delivery")) return "contracts.features.view";
    if (seg.includes("features") && (method === "PUT" || method === "PATCH")) return null;
    // Controladoria: checagem específica (controladoria.manage ou ADMIN + contracts.edit).
    if (seg.includes("forward-controladoria") && method === "POST") return null;
    if (seg.includes("controladoria-cases") && method === "PUT") return null;
    if (method === "GET") return "contracts.view";
    if (method === "POST" && seg.length === 1) return "contracts.create";
    if (method === "DELETE" && seg.length === 2) return "contracts.delete";
    return "contracts.edit";
  }
  if (root === "controladoria-cases") {
    return isRead ? "controladoria.manage" : "controladoria.manage";
  }
  if (root === "measurements") {
    if (isRead) return "measurements.view";
    return method === "POST" && seg.length === 1 ? "measurements.create" : "measurements.edit";
  }
  if (root === "glosas") return isRead ? "glosas.view" : "glosas.create";
  if (root === "projects") return isRead ? "projects.view" : "projects.edit";
  if (root === "goals") return isRead ? "goals.view" : null;
  if (root === "governance") return isRead ? "governance.view" : null;
  if (root === "suppliers") return isRead ? "suppliers.view" : null;
  if (root === "fiscais") return isRead ? "fiscais.view" : null;
  if (root === "reports") return isRead ? "reports.view" : null;
  return null;
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

function requestIp(req: Request): string | null {
  const raw = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  return raw?.split(",")[0]?.trim() || null;
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
    try {
      const user = await requireUser(req);
      if (!user) return jsonErr(401, "Não autenticado");
      const { prisma } = await import("@/glpi/config/prisma");
      return jsonOk(await resolveAuthMeForUser(prisma, user.sub));
    } catch (e) {
      if (e instanceof HttpException) {
        return NextResponse.json({ error: e.message, message: e.message }, { status: e.getStatus() });
      }
      return jsonErr(401, "Não autenticado");
    }
  }

  if (seg[0] === "auth" && seg[1] === "context" && method === "POST") {
    try {
      const user = await requireUser(req);
      if (!user) return jsonErr(401, "Não autenticado");
      const { prisma } = await import("@/glpi/config/prisma");
      const body = (await readJsonBody(req)) as { profileId?: string; organizationId?: string | null };
      if (!body?.profileId) return jsonErr(400, "Informe o perfil de acesso.");
      const me = await switchUserAccessContext(prisma, user.sub, {
        profileId: body.profileId,
        organizationId: body.organizationId
      });
      const token = await issueAuthToken({
        id: me.id,
        email: me.email,
        role: me.activeContext.systemKey ?? me.role,
        mustChangePassword: me.mustChangePassword
      });
      return jsonOk({ ...me, access_token: token.access_token, expires_in: token.expires_in });
    } catch (e) {
      if (e instanceof HttpException) {
        return NextResponse.json({ error: e.message, message: e.message }, { status: e.getStatus() });
      }
      const msg = e instanceof Error ? e.message : String(e);
      return jsonErr(400, msg);
    }
  }

  let user: JwtUser;
  try {
    const u = await requireUser(req);
    if (!u) return jsonErr(401, "Não autenticado");
    user = u;
  } catch (e) {
    if (e instanceof HttpException) {
      return NextResponse.json({ error: e.message, message: e.message }, { status: e.getStatus() });
    }
    return jsonErr(401, "Não autenticado");
  }

  const effectivePermissions = await gestaoPermissions.resolveEffectivePermissions(user.sub, user.profileId);
  user.effectivePermissionKeys = new Set(effectivePermissions.keys);
  user.usingLegacyPermissionFallback = effectivePermissions.keys.length === 0;

  const actor = toRequestActor(
    {
      id: user.sub,
      email: user.email,
      userKind: user.userKind,
      supplierId: user.supplierId,
      authorizedContractIds: user.authorizedContractIds
    },
    {
      profileId: user.profileId ?? "",
      profileName: "",
      systemKey: user.systemKey ?? user.role,
      role: user.role,
      organizationId: user.organizationId,
      organizationLabel: "",
      allOrganizationsActive: user.allOrganizationsActive
    }
  );

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
  const requiredPermission = requiredPermissionForRoute(method, seg);
  if (requiredPermission) assertPermission(user, requiredPermission);

  // Catálogos administrativos também alimentam formulários operacionais (contrato/usuário).
  if (method === "GET" || method === "HEAD") {
    if (root === "organizations") {
      assertAnyPermission(user, ["admin.organs.view", "contracts.view", "admin.users.view"]);
    } else if (root === "contract-type-catalog") {
      assertAnyPermission(user, ["admin.contract_types.view", "contracts.view", "contracts.create", "contracts.edit"]);
    } else if (root === "hiring-types") {
      assertAnyPermission(user, ["admin.hiring_types.view", "contracts.view", "contracts.create", "contracts.edit"]);
    } else if (root === "contracts" && seg[1] === "catalog" && seg[2] === "item-types") {
      assertAnyPermission(user, ["admin.item_types.view", "contracts.view", "contracts.create", "contracts.edit"]);
    } else if (root === "users" && seg[1] === "options") {
      assertAnyPermission(user, [
        "admin.users.view",
        "contracts.view",
        "contracts.create",
        "contracts.edit",
        "projects.view",
        "projects.edit"
      ]);
    }
  }

  if (root === "profile") {
    if (seg.length === 1 && method === "GET") {
      return jsonOk({
        id: user.sub,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        profileColor: user.profileColor,
        jobTitle: user.jobTitle,
        department: user.department,
        phone: user.phone,
        role: user.role,
        mustChangePassword: user.mustChangePassword
      });
    }
    if (seg.length === 1 && method === "PATCH") {
      const body = await readJsonBody(req);
      if (body == null || typeof body !== "object") {
        return jsonErr(400, "Corpo JSON inválido ou ausente. Use Content-Type: application/json.");
      }
      return jsonOk(await gestaoUsers.updateMyProfile(user.sub, body as never));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "admin" && seg[1] === "audit-logs") {
    assertRoles(user, [UserRole.ADMIN]);
    if (seg.length === 2 && method === "GET") {
      const u = new URL(req.url);
      return jsonOk(
        await gestaoAuditLogs.list({
          page: u.searchParams.get("page") ? Number(u.searchParams.get("page")) : undefined,
          limit: u.searchParams.get("limit") ? Number(u.searchParams.get("limit")) : undefined,
          from: u.searchParams.get("from"),
          to: u.searchParams.get("to"),
          actor: u.searchParams.get("actor"),
          action: u.searchParams.get("action"),
          entity: u.searchParams.get("entity"),
          q: u.searchParams.get("q"),
          source: u.searchParams.get("source")
        })
      );
    }
    if (seg.length === 3 && seg[2] === "event-config" && method === "GET") {
      return jsonOk(await gestaoAuditLogs.listEventConfig());
    }
    if (seg.length === 3 && seg[2] === "event-config" && method === "PUT") {
      const body = (await readJsonBody(req)) as {
        items?: Array<{ id: string; enabled: boolean; detailLevel?: string }>;
      };
      return jsonOk(await gestaoAuditLogs.saveEventConfig({ items: body?.items ?? [] }));
    }
    if (seg.length === 4 && seg[2] === "event-config" && seg[3] === "restore-defaults" && method === "POST") {
      return jsonOk(await gestaoAuditLogs.restoreEventConfigDefaults());
    }
    if (seg.length === 3 && seg[2] === "retention" && method === "GET") {
      return jsonOk(await gestaoAuditLogs.listRetentionPolicies());
    }
    if (seg.length === 3 && seg[2] === "retention" && method === "PUT") {
      const body = (await readJsonBody(req)) as {
        items?: Array<{ id: string; retentionDays: number; active: boolean }>;
      };
      return jsonOk(await gestaoAuditLogs.saveRetentionPolicies({ items: body?.items ?? [] }));
    }
    if (seg.length === 4 && seg[2] === "retention" && seg[3] === "indicators" && method === "GET") {
      return jsonOk(await gestaoAuditLogs.getStorageIndicators());
    }
    if (seg.length === 4 && seg[2] === "retention" && seg[3] === "runs" && method === "GET") {
      const u = new URL(req.url);
      return jsonOk(
        await gestaoAuditLogs.listRetentionRuns(
          u.searchParams.get("limit") ? Number(u.searchParams.get("limit")) : undefined
        )
      );
    }
    if (seg.length === 4 && seg[2] === "retention" && seg[3] === "dry-run" && method === "POST") {
      return jsonOk(await gestaoAuditLogs.runRetentionDiscard({ dryRun: true }));
    }
    if (seg.length === 4 && seg[2] === "retention" && seg[3] === "execute" && method === "POST") {
      const body = (await readJsonBody(req)) as { confirmed?: boolean };
      return jsonOk(
        await gestaoAuditLogs.runRetentionDiscard({ dryRun: false, confirmed: body?.confirmed === true })
      );
    }
    if (seg.length === 3 && seg[2] === "export.csv" && method === "GET") {
      const u = new URL(req.url);
      const body = await gestaoAuditLogs.exportCsv({
        from: u.searchParams.get("from"),
        to: u.searchParams.get("to"),
        actor: u.searchParams.get("actor"),
        action: u.searchParams.get("action"),
        entity: u.searchParams.get("entity"),
        q: u.searchParams.get("q"),
        source: u.searchParams.get("source")
      });
      return new NextResponse(`\ufeff${body}`, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="auditoria-logs.csv"'
        }
      });
    }
    if (seg.length === 3 && method === "GET") {
      const u = new URL(req.url);
      return jsonOk(await gestaoAuditLogs.findOne(seg[2], u.searchParams.get("source")));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "usage") {
    if (seg.length === 2 && seg[1] === "track" && method === "POST") {
      const body = (await readJsonBody(req)) as {
        eventType?: string;
        path?: string | null;
        pathLabel?: string | null;
        sessionId?: string | null;
        durationSeconds?: number | null;
        metadata?: unknown;
      } | undefined;
      const eventType = body?.eventType === "HEARTBEAT" || body?.eventType === "PAGE_VIEW" ? body.eventType : "PAGE_VIEW";
      await gestaoUserAccess.record({
        actor: { userId: user.sub, email: user.email, role: user.role },
        eventType,
        path: body?.path,
        pathLabel: body?.pathLabel,
        sessionId: body?.sessionId,
        durationSeconds: body?.durationSeconds,
        ipAddress: requestIp(req),
        userAgent: req.headers.get("user-agent")
      });
      return jsonOk({ ok: true });
    }
    if (seg.length === 2 && seg[1] === "report" && method === "GET") {
      const u = new URL(req.url);
      return jsonOk(
        await gestaoUserAccess.report(
          {
            preset: u.searchParams.get("preset"),
            from: u.searchParams.get("from"),
            to: u.searchParams.get("to")
          },
          { userId: user.sub, email: user.email, role: user.role }
        )
      );
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "assignments") {
    if (seg.length === 2 && seg[1] === "me" && method === "GET") {
      return jsonOk(await gestaoUserAssignments.mine({ userId: user.sub, email: user.email }));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "dashboard") {
    if (seg[1] === "summary" && method === "GET") return jsonOk(await gestaoDashboard.summary());
    if (seg[1] === "alerts" && method === "GET") return jsonOk(await gestaoDashboard.alerts());
    if (seg[1] === "notifications" && method === "GET") return jsonOk(await gestaoDashboard.notificationsPlaceholder());
    return jsonErr(404, "Não encontrado");
  }

  if (root === "deadlines") {
    if (seg.length === 1 && method === "GET") {
      const u = new URL(req.url);
      return jsonOk(
        await gestaoDeadlines.list({
          origin: u.searchParams.get("origin") ?? undefined,
          status: u.searchParams.get("status") ?? undefined,
          attentionLevel: u.searchParams.get("attentionLevel") ?? undefined,
          contractId: u.searchParams.get("contractId") ?? undefined,
          responsibleUserId: u.searchParams.get("responsibleUserId") ?? undefined,
          q: u.searchParams.get("q") ?? undefined,
          includeCancelled: u.searchParams.get("includeCancelled") === "1" || u.searchParams.get("includeCancelled") === "true"
        })
      );
    }
    if (seg.length === 2 && seg[1] === "recalculate" && method === "POST") {
      assertRoles(user, [UserRole.ADMIN]);
      return jsonOk(await gestaoDeadlines.recalculate());
    }
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
    if (seg.length === 3 && seg[1] === "catalog" && seg[2] === "pricing" && method === "GET") {
      return jsonOk(await gestaoContracts.listPricingCatalog());
    }
    if (seg.length === 2 && seg[1] === "pricing-migration-review" && method === "GET") {
      assertRoles(user, [UserRole.ADMIN]);
      return jsonOk(await gestaoContracts.pricingMigrationReview());
    }
    if (seg.length === 2 && seg[1] === "identification-migration-review" && method === "GET") {
      assertRoles(user, [UserRole.ADMIN]);
      return jsonOk(await gestaoContracts.identificationMigrationReview());
    }
    if (seg.length === 2 && seg[1] === "identification-migration-repair" && method === "POST") {
      assertRoles(user, [UserRole.ADMIN]);
      return jsonOk(await gestaoContracts.repairIdentificationMigration());
    }
    if (seg.length === 3 && seg[1] === "catalog" && seg[2] === "measure-units" && method === "POST") {
      return jsonOk(await gestaoContracts.createMeasureUnit((await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[1] === "catalog" && seg[2] === "item-types" && method === "GET") {
      return jsonOk(await gestaoContracts.listItemTypesAdmin());
    }
    if (seg.length === 4 && seg[1] === "catalog" && seg[2] === "item-types" && method === "PATCH") {
      return jsonOk(await gestaoContracts.updateItemType(seg[3], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[1] === "catalog" && seg[2] === "item-types" && method === "POST") {
      return jsonOk(await gestaoContracts.createContractItemType((await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && seg[1] === "module-validators" && method === "GET") {
      return jsonOk(await gestaoContracts.findModuleValidators());
    }
    if (seg.length === 4 && seg[1] === "overview" && seg[2] === "modules-delivery" && seg[3] === "search" && method === "GET") {
      const url = new URL(req.url);
      return jsonOk(
        await gestaoContracts.searchModulesDeliveryFeatures({
          q: url.searchParams.get("q") ?? undefined,
          deliveryStatus: url.searchParams.get("deliveryStatus") ?? undefined,
          criticality: url.searchParams.get("criticality") ?? undefined,
          assignment: url.searchParams.get("assignment") ?? undefined,
          pageSize: url.searchParams.get("pageSize") ? Number(url.searchParams.get("pageSize")) : undefined
        })
      );
    }
    if (seg.length === 3 && seg[1] === "overview" && seg[2] === "modules-delivery" && method === "GET") {
      const url = new URL(req.url);
      return jsonOk(
        await gestaoContracts.findModulesDeliveryOverview({
          assignment: url.searchParams.get("assignment") ?? undefined
        })
      );
    }
    if (seg.length === 1 && method === "GET") return jsonOk(await gestaoContracts.findAll());
    if (seg.length === 1 && method === "POST") {
      return jsonOk(await gestaoContracts.create((await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && seg[1] === "form-load-failure" && method === "POST") {
      const body = (await readJsonBody(req)) as {
        action?: string | null;
        contractId?: string | null;
        stage?: string | null;
        message?: string | null;
      };
      return jsonOk(await gestaoContracts.reportFormLoadFailure(body ?? {}));
    }
    if (seg.length === 3 && seg[2] === "form-data" && method === "GET") {
      return jsonOk(await gestaoContracts.findOneForForm(seg[1]));
    }
    if (seg.length === 3 && seg[2] === "regenerate-internal-code" && method === "POST") {
      assertRoles(user, [UserRole.ADMIN]);
      assertPermission(user, "contracts.internal_code.regenerate");
      const body = (await readJsonBody(req)) as { justification?: string };
      return jsonOk(await gestaoContracts.regenerateInternalCode(seg[1], body?.justification ?? ""));
    }
    if (seg.length === 2 && method === "GET") return jsonOk(await gestaoContracts.findOne(seg[1]));
    if (seg.length === 2 && (method === "PUT" || method === "PATCH")) {
      assertPermission(user, "contracts.edit");
      return jsonOk(await gestaoContracts.update(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && method === "DELETE") {
      return jsonOk(await gestaoContracts.delete(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "modules-delivery" && method === "GET") {
      return jsonOk(await gestaoContracts.findContractModulesDelivery(seg[1]));
    }
    if (seg.length === 5 && seg[2] === "modules" && seg[4] === "features-delivery" && method === "GET") {
      const url = new URL(req.url);
      return jsonOk(
        await gestaoContracts.findModuleFeaturesDelivery(seg[1], seg[3], {
          page: url.searchParams.get("page") ? Number(url.searchParams.get("page")) : undefined,
          pageSize: url.searchParams.get("pageSize") ? Number(url.searchParams.get("pageSize")) : undefined,
          q: url.searchParams.get("q") ?? undefined,
          deliveryStatus: url.searchParams.get("deliveryStatus") ?? undefined,
          criticality: url.searchParams.get("criticality") ?? undefined,
          assignment: url.searchParams.get("assignment") ?? undefined
        })
      );
    }
    if (seg.length === 3 && seg[2] === "glpi-tickets" && method === "GET") {
      const url = new URL(req.url);
      const overdueRaw = (url.searchParams.get("slaOverdue") ?? "").trim().toLowerCase();
      return jsonOk(
        await gestaoContracts.listContractGlpiTickets(seg[1], {
          status: url.searchParams.get("status") ?? undefined,
          priority: url.searchParams.get("priority") ?? undefined,
          from: url.searchParams.get("from") ?? undefined,
          to: url.searchParams.get("to") ?? undefined,
          slaOverdue: overdueRaw === "1" || overdueRaw === "true" || overdueRaw === "yes",
          take: url.searchParams.get("take") ? Number(url.searchParams.get("take")) : undefined
        })
      );
    }
    if (seg.length === 3 && seg[2] === "schedules" && method === "GET") {
      return jsonOk(await gestaoContracts.listSchedules(seg[1]));
    }
    if (seg.length === 3 && seg[2] === "schedules" && method === "POST") {
      assertPermission(user, "contracts.edit");
      return jsonOk(await gestaoContracts.createSchedule(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 4 && seg[2] === "schedules" && method === "PUT") {
      assertPermission(user, "contracts.edit");
      return jsonOk(await gestaoContracts.updateSchedule(seg[1], seg[3], (await readJsonBody(req)) as never));
    }
    if (seg.length === 5 && seg[2] === "schedules" && seg[4] === "approve" && method === "POST") {
      assertPermission(user, "contracts.edit");
      return jsonOk(await gestaoContracts.approveSchedule(seg[1], seg[3]));
    }
    if (seg.length === 4 && seg[2] === "schedules" && method === "DELETE") {
      assertPermission(user, "contracts.edit");
      return jsonOk(await gestaoContracts.deleteSchedule(seg[1], seg[3]));
    }
    if (seg.length === 5 && seg[2] === "schedules" && seg[4] === "attachments" && method === "POST") {
      assertPermission(user, "contracts.edit");
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return jsonErr(400, "Arquivo obrigatório (campo file).");
      const buf = Buffer.from(await file.arrayBuffer());
      const multerLike = {
        buffer: buf,
        originalname: file.name || "anexo",
        mimetype: file.type || "application/octet-stream",
        size: buf.length
      } as Express.Multer.File;
      return jsonOk(await gestaoContracts.addScheduleAttachmentUpload(seg[1], seg[3], multerLike));
    }
    if (
      seg.length === 6 &&
      seg[2] === "schedules" &&
      seg[4] === "attachments" &&
      method === "DELETE"
    ) {
      assertPermission(user, "contracts.edit");
      return jsonOk(await gestaoContracts.removeScheduleAttachment(seg[1], seg[3], seg[5]));
    }
    if (
      seg.length === 5 &&
      seg[2] === "glpi-tickets" &&
      seg[4] === "classification" &&
      method === "PUT"
    ) {
      assertPermission(user, "contracts.edit");
      return jsonOk(
        await gestaoContracts.upsertContractGlpiTicketClass(
          seg[1],
          Number(seg[3]),
          (await readJsonBody(req)) as { category?: string; notes?: string | null }
        )
      );
    }
    if (seg.length === 3 && seg[2] === "occurrences" && method === "GET") {
      return jsonOk(await gestaoContracts.listOccurrences(seg[1]));
    }
    if (seg.length === 3 && seg[2] === "occurrences" && method === "POST") {
      assertPermission(user, "contracts.edit");
      return jsonOk(await gestaoContracts.createOccurrence(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 4 && seg[2] === "occurrences" && method === "PUT") {
      assertPermission(user, "contracts.edit");
      return jsonOk(
        await gestaoContracts.updateOccurrence(seg[1], seg[3], (await readJsonBody(req)) as never)
      );
    }
    if (seg.length === 5 && seg[2] === "occurrences" && seg[4] === "status" && method === "POST") {
      assertPermission(user, "contracts.edit");
      return jsonOk(
        await gestaoContracts.changeOccurrenceStatus(seg[1], seg[3], (await readJsonBody(req)) as never)
      );
    }
    if (
      seg.length === 5 &&
      seg[2] === "occurrences" &&
      seg[4] === "forward-controladoria" &&
      method === "POST"
    ) {
      assertCanForwardToControladoria(user);
      return jsonOk(
        await gestaoContracts.forwardOccurrenceToControladoria(
          seg[1],
          seg[3],
          (await readJsonBody(req)) as never
        )
      );
    }
    if (seg.length === 4 && seg[2] === "occurrences" && method === "DELETE") {
      assertPermission(user, "contracts.edit");
      return jsonOk(await gestaoContracts.deleteOccurrence(seg[1], seg[3]));
    }
    if (seg.length === 3 && seg[2] === "controladoria-cases" && method === "GET") {
      return jsonOk(await gestaoContracts.listControladoriaCases(seg[1]));
    }
    if (seg.length === 4 && seg[2] === "controladoria-cases" && method === "PUT") {
      assertCanForwardToControladoria(user);
      return jsonOk(
        await gestaoContracts.updateControladoriaCase(seg[1], seg[3], (await readJsonBody(req)) as never)
      );
    }
    if (seg.length === 3 && seg[2] === "validation-groups" && method === "GET") {
      return jsonOk(await gestaoContracts.listValidationGroups(seg[1]));
    }
    if (seg.length === 3 && seg[2] === "validation-groups" && method === "POST") {
      assertPermission(user, "contracts.edit");
      return jsonOk(await gestaoContracts.createValidationGroup(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 4 && seg[2] === "validation-groups" && method === "PUT") {
      assertPermission(user, "contracts.edit");
      return jsonOk(await gestaoContracts.updateValidationGroup(seg[1], seg[3], (await readJsonBody(req)) as never));
    }
    if (seg.length === 4 && seg[2] === "validation-groups" && method === "DELETE") {
      assertPermission(user, "contracts.edit");
      return jsonOk(await gestaoContracts.deleteValidationGroup(seg[1], seg[3]));
    }
    if (seg.length === 4 && seg[2] === "features" && seg[3] === "bulk-validation-group" && method === "POST") {
      assertPermission(user, "contracts.edit");
      return jsonOk(await gestaoContracts.bulkUpdateFeatureValidationGroup(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "modules" && method === "POST") {
      return jsonOk(await gestaoContracts.createModule(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 4 && seg[2] === "modules" && method === "PUT") {
      return jsonOk(await gestaoContracts.updateModule(seg[1], seg[3], (await readJsonBody(req)) as never));
    }
    if (seg.length === 4 && seg[2] === "modules" && method === "DELETE") {
      return jsonOk(await gestaoContracts.deleteModule(seg[1], seg[3]));
    }
    if (seg.length === 5 && seg[2] === "modules" && seg[4] === "features" && method === "POST") {
      return jsonOk(await gestaoContracts.createFeature(seg[1], seg[3], (await readJsonBody(req)) as never));
    }
    if (seg.length === 6 && seg[2] === "modules" && seg[4] === "features" && (method === "PUT" || method === "PATCH")) {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      assertFeatureEditPermissions(user, body);
      return jsonOk(await gestaoContracts.updateFeature(seg[1], seg[3], seg[5], body as never));
    }
    if (seg.length === 6 && seg[2] === "modules" && seg[4] === "features" && method === "DELETE") {
      return jsonOk(await gestaoContracts.deleteFeature(seg[1], seg[3], seg[5]));
    }
    if (seg.length === 3 && seg[2] === "services" && method === "POST") {
      return jsonOk(await gestaoContracts.createService(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 5 && seg[2] === "services" && method === "PUT") {
      return jsonOk(await gestaoContracts.updateService(seg[1], seg[3], (await readJsonBody(req)) as never));
    }
    if (seg.length === 5 && seg[2] === "services" && method === "DELETE") {
      return jsonOk(await gestaoContracts.deleteService(seg[1], seg[3]));
    }
    if (seg.length === 3 && seg[2] === "amendments" && method === "POST") {
      return jsonOk(await gestaoContracts.createAmendment(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 5 && seg[2] === "amendments" && seg[4] === "cancel" && method === "POST") {
      return jsonOk(
        await gestaoContracts.cancelAmendment(seg[1], seg[3], (await readJsonBody(req)) as never)
      );
    }
    if (seg.length === 3 && seg[2] === "pricing-items" && method === "PUT") {
      const body = (await readJsonBody(req)) as { items?: unknown };
      return jsonOk(await gestaoContracts.replacePricingItems(seg[1], (body?.items ?? []) as never));
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
      const form = await req.formData();
      const file = form.get("file");
      const replace = String(form.get("replace") ?? "").toLowerCase() === "true";
      if (!(file instanceof File)) return jsonErr(400, "Arquivo ausente (campo file).");
      if (file.size > uploadMaxBytes()) return jsonErr(400, "Arquivo muito grande");
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

  if (root === "controladoria-cases") {
    if (seg.length === 1 && method === "GET") {
      const url = new URL(req.url);
      const take = url.searchParams.get("take") ? Number(url.searchParams.get("take")) : 100;
      return jsonOk(await gestaoContracts.listAllControladoriaCases(take));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "measurements") {
    if (seg.length === 1 && method === "GET") return jsonOk(await gestaoMeasurements.findAll());
    if (seg.length === 1 && method === "POST") {
      return jsonOk(await gestaoMeasurements.create((await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "items" && method === "POST") {
      const body = (await readJsonBody(req)) as { items?: unknown };
      return jsonOk(await gestaoMeasurements.addItems(seg[1], (body?.items ?? []) as never));
    }
    if (seg.length === 4 && seg[2] === "items" && method === "DELETE") {
      return jsonOk(await gestaoMeasurements.removeItem(seg[1], seg[3]));
    }
    if (seg.length === 4 && seg[2] === "items" && method === "PATCH") {
      const body = (await readJsonBody(req)) as { quantity?: unknown };
      return jsonOk(await gestaoMeasurements.patchItem(seg[1], seg[3], body?.quantity as never));
    }
    if (seg.length === 3 && seg[2] === "calculate" && method === "POST") {
      return jsonOk(await gestaoMeasurements.calculate(seg[1]));
    }
    if (seg.length === 3 && seg[2] === "approve" && method === "POST") {
      return jsonOk(await gestaoMeasurements.approve(seg[1]));
    }
    if (seg.length === 3 && seg[2] === "glosas" && method === "POST") {
      return jsonOk(await gestaoMeasurements.addManualGlosa(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "attachments" && method === "POST") {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return jsonErr(400, "Arquivo ausente");
      if (file.size > uploadMaxBytes()) return jsonErr(400, "Arquivo demasiado grande");
      return jsonOk(await gestaoMeasurements.addAttachmentUpload(seg[1], await multerLikeFromFile(file)));
    }
    if (seg.length === 4 && seg[2] === "attachments" && method === "DELETE") {
      return jsonOk(await gestaoMeasurements.removeAttachment(seg[1], seg[3]));
    }
    if (seg.length === 2 && method === "GET") return jsonOk(await gestaoMeasurements.findOne(seg[1]));
    return jsonErr(404, "Não encontrado");
  }

  if (root === "glosas") {
    if (seg.length === 1 && method === "GET") return jsonOk(await gestaoGlosas.findAll());
    if (seg.length === 1 && method === "POST") {
      return jsonOk(await gestaoGlosas.create((await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && method === "GET") return jsonOk(await gestaoGlosas.findOne(seg[1]));
    if (seg.length === 3 && seg[2] === "attachments" && method === "POST") {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return jsonErr(400, "Arquivo ausente");
      if (file.size > uploadMaxBytes()) return jsonErr(400, "Arquivo demasiado grande");
      return jsonOk(await gestaoGlosas.addAttachmentUpload(seg[1], await multerLikeFromFile(file)));
    }
    if (seg.length === 4 && seg[2] === "attachments" && method === "DELETE") {
      return jsonOk(await gestaoGlosas.removeAttachment(seg[1], seg[3]));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "suppliers") {
    if (seg.length === 1 && method === "GET") return jsonOk(await gestaoSuppliers.findAll());
    if (seg.length === 1 && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoSuppliers.create((await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && method === "PATCH") {
      assertMutation(user, method);
      return jsonOk(await gestaoSuppliers.update(seg[1], (await readJsonBody(req)) as never));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "fiscais") {
    if (seg.length === 1 && method === "GET") return jsonOk(await gestaoFiscais.findAll());
    if (seg.length === 2 && seg[1] === "user-options" && method === "GET") {
      return jsonOk(await gestaoFiscais.findUserOptions());
    }
    if (seg.length === 1 && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoFiscais.create((await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && method === "PATCH") {
      assertMutation(user, method);
      return jsonOk(await gestaoFiscais.update(seg[1], (await readJsonBody(req)) as never));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "organizations") {
    if (seg.length === 1 && method === "GET") {
      const u = new URL(req.url);
      const active = u.searchParams.get("active");
      const filter =
        active === "true" ? { active: true } : active === "false" ? { active: false } : undefined;
      return jsonOk(await gestaoOrganizations.findAll(filter));
    }
    if (seg.length === 1 && method === "POST") {
      return jsonOk(await gestaoOrganizations.create((await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && method === "PATCH") {
      return jsonOk(await gestaoOrganizations.update(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && method === "DELETE") {
      return jsonOk(await gestaoOrganizations.delete(seg[1]));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "permissions") {
    if (seg.length === 2 && seg[1] === "me" && method === "GET") {
      const keys = user.usingLegacyPermissionFallback
        ? [...legacyPermissionKeys(user.role)]
        : [...user.effectivePermissionKeys];
      return jsonOk({ role: user.role, profileId: user.profileId, keys: keys.sort() });
    }
    if (seg.length === 2 && seg[1] === "catalog" && method === "GET") {
      return jsonOk(gestaoPermissions.listCatalog());
    }
    if (seg.length === 2 && seg[1] === "profiles" && method === "GET") {
      const u = new URL(req.url);
      return jsonOk(
        await gestaoPermissions.listProfiles({ includeInactive: u.searchParams.get("includeInactive") === "true" })
      );
    }
    if (seg.length === 2 && seg[1] === "profiles" && method === "POST") {
      return jsonOk(await gestaoPermissions.createProfile((await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[1] === "profiles" && method === "PATCH") {
      return jsonOk(await gestaoPermissions.updateProfile(seg[2], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[1] === "profiles" && method === "DELETE") {
      return jsonOk(await gestaoPermissions.deleteProfile(seg[2]));
    }
    if (seg.length === 3 && seg[1] === "profile" && method === "GET") {
      return jsonOk(await gestaoPermissions.getProfilePermissions(seg[2]));
    }
    if (seg.length === 3 && seg[1] === "profile" && method === "PUT") {
      const body = (await readJsonBody(req)) as { keys?: string[] };
      return jsonOk(await gestaoPermissions.setProfilePermissions(seg[2], body?.keys ?? []));
    }
    if (seg.length === 4 && seg[1] === "profile" && seg[3] === "history" && method === "GET") {
      return jsonOk(await gestaoPermissions.listProfilePermissionHistory(seg[2]));
    }
    if (seg.length === 3 && seg[1] === "role" && method === "GET") {
      return jsonOk(await gestaoPermissions.getRolePermissions(gestaoPermissions.parseRoleParam(seg[2])));
    }
    if (seg.length === 3 && seg[1] === "role" && method === "PUT") {
      const body = (await readJsonBody(req)) as { keys?: string[] };
      return jsonOk(
        await gestaoPermissions.setRolePermissions(gestaoPermissions.parseRoleParam(seg[2]), body?.keys ?? [])
      );
    }
    if (seg.length === 4 && seg[1] === "role" && seg[3] === "history" && method === "GET") {
      return jsonOk(await gestaoPermissions.listRolePermissionHistory(gestaoPermissions.parseRoleParam(seg[2])));
    }
    if (seg.length === 3 && seg[1] === "user" && method === "GET") {
      const u = new URL(req.url);
      return jsonOk(await gestaoPermissions.getUserPermissions(seg[2], u.searchParams.get("profileId") ?? undefined));
    }
    if (seg.length === 3 && seg[1] === "user" && method === "PUT") {
      const body = (await readJsonBody(req)) as { keys?: string[]; profileId?: string };
      return jsonOk(await gestaoPermissions.setUserExtraPermissions(seg[2], body?.keys ?? [], body?.profileId));
    }
    if (seg.length === 4 && seg[1] === "user" && seg[3] === "history" && method === "GET") {
      return jsonOk(await gestaoPermissions.listUserPermissionHistory(seg[2]));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "contract-type-catalog") {
    if (seg.length === 1 && method === "GET") {
      const u = new URL(req.url);
      const active = u.searchParams.get("active");
      const filter =
        active === "true" ? { active: true } : active === "false" ? { active: false } : undefined;
      return jsonOk(await gestaoContractTypeCatalog.findAll(filter));
    }
    if (seg.length === 1 && method === "POST") {
      return jsonOk(await gestaoContractTypeCatalog.create((await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && method === "PATCH") {
      return jsonOk(await gestaoContractTypeCatalog.update(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && method === "DELETE") {
      return jsonOk(await gestaoContractTypeCatalog.delete(seg[1]));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "hiring-types") {
    if (seg.length === 1 && method === "GET") {
      const u = new URL(req.url);
      const active = u.searchParams.get("active");
      const filter =
        active === "true" ? { active: true } : active === "false" ? { active: false } : undefined;
      return jsonOk(await gestaoHiringTypes.findAll(filter));
    }
    if (seg.length === 1 && method === "POST") {
      return jsonOk(await gestaoHiringTypes.create((await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && method === "PATCH") {
      return jsonOk(await gestaoHiringTypes.update(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && method === "DELETE") {
      return jsonOk(await gestaoHiringTypes.delete(seg[1]));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "users") {
    if (seg.length === 1 && method === "GET") return jsonOk(await gestaoUsers.findAll());
    if (seg.length === 2 && seg[1] === "options" && method === "GET") {
      return jsonOk(await gestaoUsers.findOptions());
    }
    if (seg.length === 1 && method === "POST") {
      const created = await gestaoUsers.create((await readJsonBody(req)) as never);
      sendWelcomePasswordEmail(created).catch((e) => {
        console.error("[users] falha ao enviar e-mail de boas-vindas", e);
      });
      return jsonOk(created);
    }
    if (seg.length === 2 && method === "PATCH") {
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
    if (seg.length === 2 && seg[1] === "pricing-items" && method === "GET") {
      const u = new URL(req.url);
      const status = u.searchParams.get("status");
      const year = Number(u.searchParams.get("year"));
      const month = Number(u.searchParams.get("month"));
      return jsonOk(
        await gestaoPricingItemsFinancialReport.list({
          organizationId: u.searchParams.get("organizationId") || undefined,
          status: status === "ACTIVE" || status === "CANCELLED" ? status : undefined,
          year: Number.isFinite(year) ? year : undefined,
          month: Number.isFinite(month) ? month : undefined
        })
      );
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "exports") {
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
    if (seg[1] === "pricing-items.csv" && method === "GET") return csv(await gestaoExports.pricingItemsCsv(), "itens-contratuais.csv");
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
    if (seg.length === 6 && seg[2] === "tasks" && seg[4] === "attachments" && method === "DELETE") {
      assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
      assertMutation(user, method);
      return jsonOk(await gestaoProjects.removeTaskAttachment(seg[1], seg[3], seg[5]));
    }
    if (seg.length === 5 && seg[2] === "tasks" && seg[4] === "comments" && method === "POST") {
      assertRoles(user, [UserRole.ADMIN, UserRole.EDITOR]);
      assertMutation(user, method);
      const body = await readJsonBody(req);
      if (body == null || typeof body !== "object") {
        return jsonErr(400, "Corpo JSON inválido ou ausente. Use Content-Type: application/json.");
      }
      return jsonOk(await gestaoProjects.addTaskComment(seg[1], seg[3], body as never));
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
    return jsonErr(404, "Não encontrado");
  }

  if (root === "notification-templates") {
    if (seg.length === 1 && method === "GET") {
      assertAnyPermission(user, ["notification_templates.manage", "notifications.manage", "notifications.view"]);
      const u = new URL(req.url);
      return jsonOk(
        await gestaoNotificationTemplates.findAll(
          u.searchParams.get("includeInactive") === "1" || u.searchParams.get("includeInactive") === "true"
        )
      );
    }
    if (seg.length === 2 && seg[1] === "mail-merge-fields" && method === "GET") {
      assertAnyPermission(user, ["notification_templates.manage", "notifications.manage"]);
      return jsonOk({ fields: gestaoNotificationTemplates.mailMergeFields() });
    }
    if (seg.length === 1 && method === "POST") {
      assertRoles(user, [UserRole.ADMIN]);
      return jsonOk(await gestaoNotificationTemplates.create((await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && method === "GET") {
      assertAnyPermission(user, ["notification_templates.manage", "notifications.manage", "notifications.view"]);
      return jsonOk(await gestaoNotificationTemplates.findOne(seg[1]));
    }
    if (seg.length === 2 && method === "PATCH") {
      assertRoles(user, [UserRole.ADMIN]);
      return jsonOk(await gestaoNotificationTemplates.update(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "deactivate" && method === "POST") {
      assertRoles(user, [UserRole.ADMIN]);
      return jsonOk(await gestaoNotificationTemplates.deactivate(seg[1]));
    }
    if (seg.length === 2 && method === "DELETE") {
      assertRoles(user, [UserRole.ADMIN]);
      return jsonOk(await gestaoNotificationTemplates.remove(seg[1]));
    }
    return jsonErr(404, "Não encontrado");
  }

  if (root === "contract-notifications") {
    if (seg.length === 1 && method === "GET") {
      return jsonOk(await gestaoContractNotifications.listMine());
    }
    if (seg.length === 3 && seg[1] === "by-contract" && method === "GET") {
      return jsonOk(await gestaoContractNotifications.listByContract(seg[2]));
    }
    if (seg.length === 2 && seg[1] === "from-template" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoContractNotifications.createFromTemplate((await readJsonBody(req)) as never));
    }
    if (seg.length === 2 && method === "GET") {
      return jsonOk(await gestaoContractNotifications.findOne(seg[1]));
    }
    if (seg.length === 3 && seg[2] === "print" && method === "GET") {
      return jsonOk(await gestaoContractNotifications.printableHtml(seg[1]));
    }
    if (seg.length === 3 && seg[2] === "pdf" && method === "GET") {
      const pdf = await gestaoContractNotifications.printablePdf(seg[1]);
      return new NextResponse(new Uint8Array(pdf.buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${pdf.filename.replace(/"/g, "'")}"`
        }
      });
    }
    if (seg.length === 2 && method === "PATCH") {
      assertMutation(user, method);
      return jsonOk(await gestaoContractNotifications.updateDraft(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "transition" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoContractNotifications.transition(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "signers" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoContractNotifications.setSigners(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "sign" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoContractNotifications.sign(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "prepare-send" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoContractNotifications.prepareSend(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "confirm-send" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoContractNotifications.confirmSend(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "acknowledge" && method === "POST") {
      assertPermission(user, "notifications.respond");
      return jsonOk(await gestaoContractNotifications.acknowledge(seg[1]));
    }
    if (seg.length === 3 && seg[2] === "response" && method === "POST") {
      assertPermission(user, "notifications.respond");
      return jsonOk(await gestaoContractNotifications.saveResponse(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 5 && seg[2] === "responses" && seg[4] === "analyze" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(
        await gestaoContractNotifications.analyzeResponse(seg[1], seg[3], (await readJsonBody(req)) as never)
      );
    }
    if (seg.length === 3 && seg[2] === "cancel" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoContractNotifications.cancel(seg[1], (await readJsonBody(req)) as never));
    }
    if (seg.length === 3 && seg[2] === "rectify" && method === "POST") {
      assertMutation(user, method);
      return jsonOk(await gestaoContractNotifications.rectify(seg[1], (await readJsonBody(req)) as never));
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
