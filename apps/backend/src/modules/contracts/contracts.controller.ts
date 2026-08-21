import {
  Body,
  Controller,
  Delete,
  Get,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UserRole } from "@prisma/client";
import { createReadStream, existsSync } from "node:fs";
import { memoryStorage } from "multer";
import { Roles } from "../../auth/roles-required.decorator";
import { ContractsService } from "./contracts.service";
import { ContractConsumptionService } from "./contract-consumption.service";
import {
  CancelContractAmendmentDto,
  CancelOrInactivateContractFileDto,
  ChangeContractOccurrenceStatusDto,
  CreateContractAmendmentDto,
  CreateContractDto,
  BulkUpdateFeatureValidationGroupDto,
  CreateContractFeatureDto,
  CreateContractItemTypeAdminDto,
  CreateContractModuleDto,
  CreateContractOccurrenceDto,
  CreateContractScheduleDto,
  CreateContractServiceDto,
  CreateContractValidationGroupDto,
  DeleteContractDto,
  ForwardOccurrenceToControladoriaDto,
  PricingItemDto,
  RegenerateInternalCodeDto,
  UpdateContractControladoriaCaseDto,
  UpdateContractDto,
  UpdateContractFeatureDto,
  UpdateContractItemTypeAdminDto,
  UpdateContractModuleDto,
  UpdateContractOccurrenceDto,
  UpdateContractScheduleDto,
  UpdateContractServiceDto,
  UpdateContractValidationGroupDto
} from "./contracts.dto";

function uploadMaxBytes(): number {
  const n = Number(process.env.UPLOAD_MAX_MB ?? "10");
  return (Number.isFinite(n) && n > 0 ? n : 10) * 1024 * 1024;
}

@Controller("contracts")
export class ContractsController {
  constructor(
    private readonly service: ContractsService,
    private readonly consumption: ContractConsumptionService
  ) {}

  @Post()
  create(@Body() dto: CreateContractDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Get()
  findAll(): Promise<unknown> {
    return this.service.findAll();
  }

  /** Grupos GLPI já observados nos chamados sincronizados (para escolher vínculos ao contrato). */
  @Get("catalog/glpi-assigned-groups")
  listGlpiAssignedGroups(): Promise<unknown> {
    return this.service.findDistinctGlpiAssignedGroupOptions();
  }

  /** Catálogo de tipos padronizados e unidades de medida dos itens contratuais. */
  @Get("catalog/pricing")
  listPricingCatalog(): Promise<unknown> {
    return this.service.listPricingCatalog();
  }

  /** Conferência administrativa do backfill de itens de precificação dos contratos ativos. */
  @Get("pricing-migration-review")
  @Roles(UserRole.ADMIN)
  pricingMigrationReview(): Promise<unknown> {
    return this.service.pricingMigrationReview();
  }

  /** Conferência administrativa da migração de identificação dos contratos. */
  @Get("identification-migration-review")
  @Roles(UserRole.ADMIN)
  identificationMigrationReview(): Promise<unknown> {
    return this.service.identificationMigrationReview();
  }

  /** Reaplica migração segura de identificação (sem inventar número formal). */
  @Post("identification-migration-repair")
  @Roles(UserRole.ADMIN)
  repairIdentificationMigration(): Promise<unknown> {
    return this.service.repairIdentificationMigration();
  }

  /** Relatório financeiro por item contratual, exclusivo para administração. */
  @Get("pricing-items-report")
  @Roles(UserRole.ADMIN)
  pricingItemsFinancialReport(
    @Query("organizationId") organizationId?: string,
    @Query("status") status?: string,
    @Query("year") year?: string,
    @Query("month") month?: string
  ): Promise<unknown> {
    const y = Number(year);
    const m = Number(month);
    return this.service.listPricingItemsFinancialReport({
      organizationId: organizationId || undefined,
      status: status === "ACTIVE" || status === "CANCELLED" ? status : undefined,
      year: Number.isFinite(y) ? y : undefined,
      month: Number.isFinite(m) ? m : undefined
    });
  }

  @Post("catalog/measure-units")
  createMeasureUnit(@Body() body: { code: string; label: string }): Promise<unknown> {
    return this.service.createMeasureUnit(body);
  }

  @Post("catalog/item-types")
  createContractItemType(@Body() body: { code: string; label: string }): Promise<unknown> {
    return this.service.createContractItemType(body);
  }

  /** Listagem administrativa de tipos de item (inclui inativos e metadados). */
  @Get("catalog/item-types")
  @Roles(UserRole.ADMIN)
  listItemTypesAdmin(): Promise<unknown> {
    return this.service.listItemTypesAdmin();
  }

  @Post("catalog/item-types/admin")
  @Roles(UserRole.ADMIN)
  createItemTypeAdmin(@Body() body: CreateContractItemTypeAdminDto): Promise<unknown> {
    return this.service.createItemType(body);
  }

  @Patch("catalog/item-types/:id")
  @Roles(UserRole.ADMIN)
  updateItemTypeAdmin(@Param("id") id: string, @Body() body: UpdateContractItemTypeAdminDto): Promise<unknown> {
    return this.service.updateItemType(id, body);
  }

  /** Usuários elegíveis para seleção como fiscais/responsáveis de módulo. */
  @Get("module-validators")
  moduleValidators(): Promise<unknown> {
    return this.service.findModuleValidators();
  }

  /** Resumo dos contratos com estrutura modular (totais agregados, sem funcionalidades). */
  @Get("overview/modules-delivery")
  modulesDeliveryOverview(@Query("assignment") assignment?: string): Promise<unknown> {
    return this.service.findModulesDeliveryOverview({ assignment });
  }

  /** Pesquisa/filtros server-side sobre funcionalidades de todos os contratos visíveis. */
  @Get("overview/modules-delivery/search")
  searchModulesDelivery(
    @Query("q") q?: string,
    @Query("deliveryStatus") deliveryStatus?: string,
    @Query("criticality") criticality?: string,
    @Query("assignment") assignment?: string,
    @Query("pageSize") pageSize?: string
  ): Promise<unknown> {
    return this.service.searchModulesDeliveryFeatures({
      q,
      deliveryStatus,
      criticality,
      assignment,
      pageSize: pageSize ? Number(pageSize) : undefined
    });
  }

  /** Módulos de um contrato com totais (lazy-load da tela Funcionalidades). */
  @Get(":id/modules-delivery")
  contractModulesDelivery(@Param("id") contractId: string): Promise<unknown> {
    return this.service.findContractModulesDelivery(contractId);
  }

  /** Funcionalidades de um módulo com paginação. */
  @Get(":id/modules/:moduleId/features-delivery")
  moduleFeaturesDelivery(
    @Param("id") contractId: string,
    @Param("moduleId") moduleId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
    @Query("deliveryStatus") deliveryStatus?: string,
    @Query("criticality") criticality?: string,
    @Query("assignment") assignment?: string
  ): Promise<unknown> {
    return this.service.findModuleFeaturesDelivery(contractId, moduleId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q,
      deliveryStatus,
      criticality,
      assignment
    });
  }

  @Get(":id/validation-groups")
  listValidationGroups(@Param("id") contractId: string): Promise<unknown> {
    return this.service.listValidationGroups(contractId);
  }

  /** Chamados GLPI em cache vinculados aos grupos do contrato (somente leitura). */
  @Get(":id/glpi-tickets")
  listGlpiTickets(
    @Param("id") contractId: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("slaOverdue") slaOverdue?: string,
    @Query("take") take?: string
  ): Promise<unknown> {
    const overdueRaw = (slaOverdue ?? "").trim().toLowerCase();
    return this.service.listContractGlpiTickets(contractId, {
      status,
      priority,
      from,
      to,
      slaOverdue: overdueRaw === "1" || overdueRaw === "true" || overdueRaw === "yes",
      take: take ? Number(take) : undefined
    });
  }

  @Get(":id/schedules")
  listSchedules(@Param("id") contractId: string): Promise<unknown> {
    return this.service.listSchedules(contractId);
  }

  @Post(":id/schedules")
  createSchedule(
    @Param("id") contractId: string,
    @Body() dto: CreateContractScheduleDto
  ): Promise<unknown> {
    return this.service.createSchedule(contractId, dto);
  }

  @Put(":id/schedules/:scheduleId")
  updateSchedule(
    @Param("id") contractId: string,
    @Param("scheduleId") scheduleId: string,
    @Body() dto: UpdateContractScheduleDto
  ): Promise<unknown> {
    return this.service.updateSchedule(contractId, scheduleId, dto);
  }

  @Post(":id/schedules/:scheduleId/approve")
  approveSchedule(
    @Param("id") contractId: string,
    @Param("scheduleId") scheduleId: string
  ): Promise<unknown> {
    return this.service.approveSchedule(contractId, scheduleId);
  }

  @Delete(":id/schedules/:scheduleId")
  deleteSchedule(
    @Param("id") contractId: string,
    @Param("scheduleId") scheduleId: string
  ): Promise<unknown> {
    return this.service.deleteSchedule(contractId, scheduleId);
  }

  @Post(":id/schedules/:scheduleId/attachments")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: uploadMaxBytes() + 1024 }
    })
  )
  addScheduleAttachment(
    @Param("id") contractId: string,
    @Param("scheduleId") scheduleId: string,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [new MaxFileSizeValidator({ maxSize: uploadMaxBytes() })]
      })
    )
    file: Express.Multer.File
  ): Promise<unknown> {
    return this.service.addScheduleAttachmentUpload(contractId, scheduleId, file);
  }

  @Delete(":id/schedules/:scheduleId/attachments/:attachmentId")
  removeScheduleAttachment(
    @Param("id") contractId: string,
    @Param("scheduleId") scheduleId: string,
    @Param("attachmentId") attachmentId: string
  ): Promise<{ ok: true }> {
    return this.service.removeScheduleAttachment(contractId, scheduleId, attachmentId);
  }

  @Get(":id/files")
  listContractFiles(
    @Param("id") contractId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
    @Query("documentType") documentType?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ): Promise<unknown> {
    return this.service.listContractFiles(contractId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q,
      documentType,
      from,
      to
    });
  }

  @Post(":id/files")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: uploadMaxBytes() + 1024 }
    })
  )
  uploadContractFile(
    @Param("id") contractId: string,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [new MaxFileSizeValidator({ maxSize: uploadMaxBytes() })]
      })
    )
    file: Express.Multer.File,
    @Body() body: Record<string, string>
  ): Promise<unknown> {
    return this.service.uploadContractFile(contractId, file, {
      documentType: body.documentType ?? "",
      title: body.title ?? "",
      documentDate: body.documentDate ?? "",
      notes: body.notes ?? null,
      referenceCode: body.referenceCode ?? null,
      visibility: body.visibility ?? null
    });
  }

  @Get(":id/files/:fileId/download")
  async downloadContractFile(
    @Param("id") contractId: string,
    @Param("fileId") fileId: string
  ): Promise<StreamableFile> {
    const meta = await this.service.resolveContractFileDownload(contractId, fileId);
    if (!existsSync(meta.absolutePath)) {
      throw new NotFoundException("Arquivo não existe no armazenamento");
    }
    const stream = createReadStream(meta.absolutePath);
    const safeName = meta.fileName.replace(/"/g, "'");
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `attachment; filename="${safeName}"`
    });
  }

  @Post(":id/files/:fileId/cancel")
  cancelContractFile(
    @Param("id") contractId: string,
    @Param("fileId") fileId: string,
    @Body() dto: CancelOrInactivateContractFileDto
  ): Promise<unknown> {
    return this.service.cancelContractFile(contractId, fileId, dto);
  }

  @Post(":id/files/:fileId/inactivate")
  inactivateContractFile(
    @Param("id") contractId: string,
    @Param("fileId") fileId: string,
    @Body() dto: CancelOrInactivateContractFileDto
  ): Promise<unknown> {
    return this.service.inactivateContractFile(contractId, fileId, dto);
  }

  @Put(":id/glpi-tickets/:glpiTicketId/classification")
  upsertGlpiTicketClassification(
    @Param("id") contractId: string,
    @Param("glpiTicketId") glpiTicketId: string,
    @Body() body: { category?: string; notes?: string | null }
  ): Promise<unknown> {
    return this.service.upsertContractGlpiTicketClass(contractId, Number(glpiTicketId), body);
  }

  @Get(":id/occurrences")
  listOccurrences(@Param("id") contractId: string): Promise<unknown> {
    return this.service.listOccurrences(contractId);
  }

  @Post(":id/occurrences")
  createOccurrence(
    @Param("id") contractId: string,
    @Body() dto: CreateContractOccurrenceDto
  ): Promise<unknown> {
    return this.service.createOccurrence(contractId, dto);
  }

  @Put(":id/occurrences/:occurrenceId")
  updateOccurrence(
    @Param("id") contractId: string,
    @Param("occurrenceId") occurrenceId: string,
    @Body() dto: UpdateContractOccurrenceDto
  ): Promise<unknown> {
    return this.service.updateOccurrence(contractId, occurrenceId, dto);
  }

  @Post(":id/occurrences/:occurrenceId/status")
  changeOccurrenceStatus(
    @Param("id") contractId: string,
    @Param("occurrenceId") occurrenceId: string,
    @Body() dto: ChangeContractOccurrenceStatusDto
  ): Promise<unknown> {
    return this.service.changeOccurrenceStatus(contractId, occurrenceId, dto);
  }

  @Post(":id/occurrences/:occurrenceId/forward-controladoria")
  forwardOccurrenceToControladoria(
    @Param("id") contractId: string,
    @Param("occurrenceId") occurrenceId: string,
    @Body() dto: ForwardOccurrenceToControladoriaDto
  ): Promise<unknown> {
    return this.service.forwardOccurrenceToControladoria(contractId, occurrenceId, dto);
  }

  @Delete(":id/occurrences/:occurrenceId")
  deleteOccurrence(
    @Param("id") contractId: string,
    @Param("occurrenceId") occurrenceId: string
  ): Promise<unknown> {
    return this.service.deleteOccurrence(contractId, occurrenceId);
  }

  @Get(":id/controladoria-cases")
  listControladoriaCases(@Param("id") contractId: string): Promise<unknown> {
    return this.service.listControladoriaCases(contractId);
  }

  @Put(":id/controladoria-cases/:caseId")
  updateControladoriaCase(
    @Param("id") contractId: string,
    @Param("caseId") caseId: string,
    @Body() dto: UpdateContractControladoriaCaseDto
  ): Promise<unknown> {
    return this.service.updateControladoriaCase(contractId, caseId, dto);
  }

  @Post(":id/validation-groups")
  createValidationGroup(
    @Param("id") contractId: string,
    @Body() dto: CreateContractValidationGroupDto
  ): Promise<unknown> {
    return this.service.createValidationGroup(contractId, dto);
  }

  @Put(":id/validation-groups/:groupId")
  updateValidationGroup(
    @Param("id") contractId: string,
    @Param("groupId") groupId: string,
    @Body() dto: UpdateContractValidationGroupDto
  ): Promise<unknown> {
    return this.service.updateValidationGroup(contractId, groupId, dto);
  }

  @Delete(":id/validation-groups/:groupId")
  deleteValidationGroup(
    @Param("id") contractId: string,
    @Param("groupId") groupId: string
  ): Promise<unknown> {
    return this.service.deleteValidationGroup(contractId, groupId);
  }

  @Post(":id/features/bulk-validation-group")
  bulkUpdateFeatureValidationGroup(
    @Param("id") contractId: string,
    @Body() dto: BulkUpdateFeatureValidationGroupDto
  ): Promise<unknown> {
    return this.service.bulkUpdateFeatureValidationGroup(contractId, dto);
  }

  /** Rotas mais específicas antes de `:id` solto (evita ambiguidade em alguns casos). */
  @Post(":id/modules")
  createModule(@Param("id") contractId: string, @Body() dto: CreateContractModuleDto): Promise<unknown> {
    return this.service.createModule(contractId, dto);
  }

  @Put(":id/modules/:moduleId")
  updateModule(
    @Param("id") contractId: string,
    @Param("moduleId") moduleId: string,
    @Body() dto: UpdateContractModuleDto
  ): Promise<unknown> {
    return this.service.updateModule(contractId, moduleId, dto);
  }

  @Delete(":id/modules/:moduleId")
  deleteModule(@Param("id") contractId: string, @Param("moduleId") moduleId: string): Promise<unknown> {
    return this.service.deleteModule(contractId, moduleId);
  }

  @Post(":id/modules/:moduleId/features")
  createFeature(
    @Param("id") contractId: string,
    @Param("moduleId") moduleId: string,
    @Body() dto: CreateContractFeatureDto
  ): Promise<unknown> {
    return this.service.createFeature(contractId, moduleId, dto);
  }

  @Put(":id/modules/:moduleId/features/:featureId")
  updateFeature(
    @Param("id") contractId: string,
    @Param("moduleId") moduleId: string,
    @Param("featureId") featureId: string,
    @Body() dto: UpdateContractFeatureDto
  ): Promise<unknown> {
    return this.service.updateFeature(contractId, moduleId, featureId, dto);
  }

  @Get(":id/modules/:moduleId/features/:featureId/delivery-events")
  featureDeliveryEvents(
    @Param("id") contractId: string,
    @Param("moduleId") moduleId: string,
    @Param("featureId") featureId: string
  ): Promise<unknown> {
    return this.service.findFeatureDeliveryEvents(contractId, moduleId, featureId);
  }

  @Post(":id/modules/:moduleId/features/:featureId/delivery-events/:eventId/annul")
  annulFeatureDeliveryEvent(
    @Param("id") contractId: string,
    @Param("moduleId") moduleId: string,
    @Param("featureId") featureId: string,
    @Param("eventId") eventId: string,
    @Body() body: { reason?: string }
  ): Promise<unknown> {
    return this.service.annulFeatureDeliveryEvent(
      contractId,
      moduleId,
      featureId,
      eventId,
      body.reason ?? ""
    );
  }

  @Delete(":id/modules/:moduleId/features/:featureId")
  deleteFeature(
    @Param("id") contractId: string,
    @Param("moduleId") moduleId: string,
    @Param("featureId") featureId: string
  ): Promise<unknown> {
    return this.service.deleteFeature(contractId, moduleId, featureId);
  }

  @Post(":id/services")
  createService(@Param("id") contractId: string, @Body() dto: CreateContractServiceDto): Promise<unknown> {
    return this.service.createService(contractId, dto);
  }

  @Put(":id/services/:serviceId")
  updateService(
    @Param("id") contractId: string,
    @Param("serviceId") serviceId: string,
    @Body() dto: UpdateContractServiceDto
  ): Promise<unknown> {
    return this.service.updateService(contractId, serviceId, dto);
  }

  @Delete(":id/services/:serviceId")
  deleteService(@Param("id") contractId: string, @Param("serviceId") serviceId: string): Promise<unknown> {
    return this.service.deleteService(contractId, serviceId);
  }

  @Post(":id/amendments")
  createAmendment(@Param("id") contractId: string, @Body() dto: CreateContractAmendmentDto): Promise<unknown> {
    return this.service.createAmendment(contractId, dto);
  }

  @Post(":id/amendments/:amendmentId/cancel")
  cancelAmendment(
    @Param("id") contractId: string,
    @Param("amendmentId") amendmentId: string,
    @Body() dto: CancelContractAmendmentDto
  ): Promise<unknown> {
    return this.service.cancelAmendment(contractId, amendmentId, dto);
  }

  @Put(":id/pricing-items")
  replacePricingItems(
    @Param("id") contractId: string,
    @Body() body: { items: PricingItemDto[] }
  ): Promise<unknown> {
    return this.service.replacePricingItems(contractId, body?.items ?? []);
  }

  @Post(":id/regenerate-internal-code")
  @Roles(UserRole.ADMIN)
  regenerateInternalCode(
    @Param("id") id: string,
    @Body() dto: RegenerateInternalCodeDto
  ): Promise<unknown> {
    return this.service.regenerateInternalCode(id, dto.justification);
  }

  @Post("form-load-failure")
  reportFormLoadFailure(
    @Body()
    body: {
      action?: string | null;
      contractId?: string | null;
      stage?: string | null;
      message?: string | null;
    }
  ): Promise<{ ok: true }> {
    return this.service.reportFormLoadFailure(body ?? {});
  }

  @Get(":id/form-data")
  findOneForForm(@Param("id") id: string): Promise<unknown> {
    return this.service.findOneForForm(id);
  }

  /** Cabeçalho e aba Dados da ficha — sem relações pesadas. */
  @Get(":id/summary")
  findOneSummary(@Param("id") id: string): Promise<unknown> {
    return this.service.findOneSummary(id);
  }

  /** Módulos, funcionalidades e grupos de validação (aba Módulos). */
  @Get(":id/structure")
  findOneStructure(@Param("id") id: string): Promise<unknown> {
    return this.service.findOneStructure(id);
  }

  @Get(":id/feature-link-options")
  listFeatureLinkOptions(@Param("id") id: string): Promise<unknown> {
    return this.service.listFeatureLinkOptions(id);
  }

  @Get(":id/amendments")
  listAmendments(@Param("id") contractId: string): Promise<unknown> {
    return this.service.listAmendments(contractId);
  }

  @Get(":id/consumptions")
  consumptionSummary(@Param("id") id: string): Promise<unknown> {
    return this.consumption.summarize(id);
  }

  @Get(":id/consumptions/movements")
  consumptionMovements(
    @Param("id") id: string,
    @Query("pricingItemId") pricingItemId?: string,
    @Query("glpiTicketId") glpiTicketId?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ): Promise<unknown> {
    return this.consumption.listMovements(id, {
      pricingItemId: pricingItemId || undefined,
      glpiTicketId: glpiTicketId ? Number(glpiTicketId) : undefined,
      status: status || undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined
    });
  }

  @Post(":id/consumptions/movements")
  createConsumptionMovement(@Param("id") id: string, @Body() body: Record<string, unknown>): Promise<unknown> {
    return this.consumption.createMovement(id, {
      pricingItemId: String(body.pricingItemId ?? ""),
      quantity: body.quantity != null && body.quantity !== "" ? Number(body.quantity) : 0,
      estimatedQuantity:
        body.estimatedQuantity != null && body.estimatedQuantity !== ""
          ? Number(body.estimatedQuantity)
          : 0,
      activityStatus: (body.activityStatus as string | undefined) ?? undefined,
      executionDate: String(body.executionDate ?? ""),
      startDate: (body.startDate as string | null | undefined) ?? null,
      description: (body.description as string | null | undefined) ?? null,
      notes: (body.notes as string | null | undefined) ?? null,
      responsibleLabel: (body.responsibleLabel as string | null | undefined) ?? null,
      responsibleUserId: (body.responsibleUserId as string | null | undefined) ?? null,
      glpiTicketId: body.glpiTicketId != null ? Number(body.glpiTicketId) : null,
      source: body.source as never,
      submitForValidation: Boolean(body.submitForValidation)
    });
  }

  @Post(":id/consumptions/movements/:movementId/validate")
  validateConsumptionMovement(
    @Param("id") id: string,
    @Param("movementId") movementId: string,
    @Body() body: Record<string, unknown>
  ): Promise<unknown> {
    return this.consumption.validateMovement(id, movementId, {
      action: body.action as "approve" | "reject" | "adjust",
      quantity: body.quantity != null ? Number(body.quantity) : undefined,
      justification: (body.justification as string | null | undefined) ?? null,
      rejectionReason: (body.rejectionReason as string | null | undefined) ?? null
    });
  }

  @Post(":id/consumptions/movements/:movementId/reverse")
  reverseConsumptionMovement(
    @Param("id") id: string,
    @Param("movementId") movementId: string,
    @Body() body: Record<string, unknown>
  ): Promise<unknown> {
    return this.consumption.reverseMovement(id, movementId, {
      justification: (body.justification as string | null | undefined) ?? null
    });
  }

  @Get(":id/item-change-logs")
  itemChangeLogs(
    @Param("id") id: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("actor") actor?: string,
    @Query("itemType") itemType?: string,
    @Query("action") action?: string,
    @Query("q") q?: string
  ): Promise<unknown> {
    return this.service.findItemChangeLogs(id, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      from,
      to,
      actor,
      itemType,
      action,
      q
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.service.findOne(id);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateContractDto): Promise<unknown> {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Body() dto: DeleteContractDto): Promise<unknown> {
    return this.service.delete(id, dto);
  }
}
