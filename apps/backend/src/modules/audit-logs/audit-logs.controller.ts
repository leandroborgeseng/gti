import { Body, Controller, Get, Header, Param, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import { AuditLogsService } from "./audit-logs.service";

@Controller("admin/audit-logs")
@Roles(UserRole.ADMIN)
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  list(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("actor") actor?: string,
    @Query("action") action?: string,
    @Query("entity") entity?: string,
    @Query("q") q?: string,
    @Query("source") source?: string
  ): Promise<unknown> {
    return this.service.list({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      from,
      to,
      actor,
      action,
      entity,
      q,
      source
    });
  }

  @Get("event-config")
  listEventConfig(): Promise<unknown> {
    return this.service.listEventConfig();
  }

  @Put("event-config")
  saveEventConfig(
    @Body() body: { items?: Array<{ id: string; enabled: boolean; detailLevel?: string }> }
  ): Promise<unknown> {
    return this.service.saveEventConfig({ items: body?.items ?? [] });
  }

  @Post("event-config/restore-defaults")
  restoreEventConfigDefaults(): Promise<unknown> {
    return this.service.restoreEventConfigDefaults();
  }

  @Get("retention/indicators")
  retentionIndicators(): Promise<unknown> {
    return this.service.getStorageIndicators();
  }

  @Get("retention")
  listRetention(): Promise<unknown> {
    return this.service.listRetentionPolicies();
  }

  @Put("retention")
  saveRetention(
    @Body() body: { items?: Array<{ id: string; retentionDays: number; active: boolean }> }
  ): Promise<unknown> {
    return this.service.saveRetentionPolicies({ items: body?.items ?? [] });
  }

  @Get("retention/runs")
  listRetentionRuns(@Query("limit") limit?: string): Promise<unknown> {
    return this.service.listRetentionRuns(limit ? Number(limit) : undefined);
  }

  @Post("retention/dry-run")
  retentionDryRun(): Promise<unknown> {
    return this.service.runRetentionDiscard({ dryRun: true });
  }

  @Post("retention/execute")
  retentionExecute(@Body() body: { confirmed?: boolean }): Promise<unknown> {
    return this.service.runRetentionDiscard({ dryRun: false, confirmed: body?.confirmed === true });
  }

  @Get("export.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="auditoria-logs.csv"')
  async exportCsv(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("actor") actor?: string,
    @Query("action") action?: string,
    @Query("entity") entity?: string,
    @Query("q") q?: string,
    @Query("source") source?: string
  ): Promise<string> {
    const body = await this.service.exportCsv({ from, to, actor, action, entity, q, source });
    return `\ufeff${body}`;
  }

  @Get(":id")
  findOne(@Param("id") id: string, @Query("source") source?: string): Promise<unknown> {
    return this.service.findOne(id, source);
  }
}
