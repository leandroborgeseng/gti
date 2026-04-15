import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  AcknowledgeTicketDto,
  AddWatcherDto,
  ClassifyTicketDto,
  CreateTicketGovernanceDto,
  ExtendDeadlineDto,
  NotifyManagerDto,
  SendToControladoriaDto,
  SetResolvedDto
} from "./governance-tickets.dto";
import { GovernanceTicketsService } from "./governance-tickets.service";

@Controller("governance/tickets")
export class GovernanceTicketsController {
  constructor(private readonly service: GovernanceTicketsService) {}

  @Post()
  create(@Body() dto: CreateTicketGovernanceDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Get()
  findAll(): Promise<unknown> {
    return this.service.findAll();
  }

  @Get("notifications")
  notifications(): Promise<unknown> {
    return this.service.notifications();
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.service.findOne(id);
  }

  @Post("monitoring/run")
  runMonitoring(): Promise<unknown> {
    return this.service.runMonitoring();
  }

  @Post(":id/acknowledge")
  acknowledge(@Param("id") id: string, @Body() dto: AcknowledgeTicketDto): Promise<unknown> {
    return this.service.acknowledge(id, dto);
  }

  @Post(":id/classify")
  classify(@Param("id") id: string, @Body() dto: ClassifyTicketDto): Promise<unknown> {
    return this.service.classify(id, dto);
  }

  @Post(":id/resolve")
  setResolved(@Param("id") id: string, @Body() dto: SetResolvedDto): Promise<unknown> {
    return this.service.setResolved(id, dto);
  }

  @Post(":id/notify-manager")
  notifyManager(@Param("id") id: string, @Body() dto: NotifyManagerDto): Promise<unknown> {
    return this.service.notifyManager(id, dto);
  }

  @Post(":id/extend-deadline")
  extendDeadline(@Param("id") id: string, @Body() dto: ExtendDeadlineDto): Promise<unknown> {
    return this.service.extendDeadline(id, dto);
  }

  @Post(":id/watchers")
  addWatcher(@Param("id") id: string, @Body() dto: AddWatcherDto): Promise<unknown> {
    return this.service.addWatcher(id, dto);
  }

  @Post(":id/send-to-controladoria")
  sendToControladoria(@Param("id") id: string, @Body() dto: SendToControladoriaDto): Promise<unknown> {
    return this.service.sendToControladoria(id, dto);
  }
}
