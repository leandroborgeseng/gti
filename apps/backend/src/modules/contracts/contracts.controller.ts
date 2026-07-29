import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import { ContractsService } from "./contracts.service";
import {
  CreateContractAmendmentDto,
  CreateContractDto,
  CreateContractFeatureDto,
  CreateContractFinancialSnapshotDto,
  CreateContractItemTypeAdminDto,
  CreateContractModuleDto,
  CreateContractServiceDto,
  DeleteContractDto,
  PricingItemDto,
  RegenerateInternalCodeDto,
  UpdateContractDto,
  UpdateContractFeatureDto,
  UpdateContractItemTypeAdminDto,
  UpdateContractModuleDto,
  UpdateContractServiceDto
} from "./contracts.dto";

@Controller("contracts")
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

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

  /** Resumo dos contratos com estrutura modular (totais agregados, sem funcionalidades). */
  @Get("overview/modules-delivery")
  modulesDeliveryOverview(): Promise<unknown> {
    return this.service.findModulesDeliveryOverview();
  }

  /** Pesquisa/filtros server-side sobre funcionalidades de todos os contratos visíveis. */
  @Get("overview/modules-delivery/search")
  searchModulesDelivery(
    @Query("q") q?: string,
    @Query("deliveryStatus") deliveryStatus?: string,
    @Query("criticality") criticality?: string,
    @Query("pageSize") pageSize?: string
  ): Promise<unknown> {
    return this.service.searchModulesDeliveryFeatures({
      q,
      deliveryStatus,
      criticality,
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
    @Query("criticality") criticality?: string
  ): Promise<unknown> {
    return this.service.findModuleFeaturesDelivery(contractId, moduleId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q,
      deliveryStatus,
      criticality
    });
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

  @Post(":id/financial-snapshots")
  createFinancialSnapshot(
    @Param("id") contractId: string,
    @Body() dto: CreateContractFinancialSnapshotDto
  ): Promise<unknown> {
    return this.service.createFinancialSnapshot(contractId, dto);
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
