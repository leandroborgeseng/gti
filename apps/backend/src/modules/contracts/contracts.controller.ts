import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { ContractsService } from "./contracts.service";
import {
  CreateContractAmendmentDto,
  CreateContractDto,
  CreateContractFeatureDto,
  CreateContractModuleDto,
  CreateContractServiceDto,
  UpdateContractDto,
  UpdateContractFeatureDto,
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

  /** Visão geral de módulos e itens (estado de entrega) para todos os contratos com estrutura modular. */
  @Get("overview/modules-delivery")
  modulesDeliveryOverview(): Promise<unknown> {
    return this.service.findModulesDeliveryOverview();
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

  @Get(":id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.service.findOne(id);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateContractDto): Promise<unknown> {
    return this.service.update(id, dto);
  }
}
