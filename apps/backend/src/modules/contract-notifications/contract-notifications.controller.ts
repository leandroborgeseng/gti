import { Body, Controller, Get, Header, Param, Patch, Post, StreamableFile } from "@nestjs/common";
import {
  AnalyzeResponseDto,
  CancelOrRectifyDto,
  ConfirmSendDto,
  CreateFromTemplateDto,
  SaveResponseDto,
  SendNotificationDto,
  SetSignersDto,
  SignNotificationDto,
  TransitionNotificationDto,
  UpdateNotificationDraftDto
} from "./contract-notifications.dto";
import { ContractNotificationsService } from "./contract-notifications.service";

@Controller("contract-notifications")
export class ContractNotificationsController {
  constructor(private readonly service: ContractNotificationsService) {}

  @Get()
  listMine() {
    return this.service.listMine();
  }

  @Get("by-contract/:contractId")
  listByContract(@Param("contractId") contractId: string) {
    return this.service.listByContract(contractId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Get(":id/print")
  printable(@Param("id") id: string) {
    return this.service.printableHtml(id);
  }

  @Get(":id/pdf")
  @Header("Content-Type", "application/pdf")
  async pdf(@Param("id") id: string): Promise<StreamableFile> {
    const { buffer, filename } = await this.service.printablePdf(id);
    return new StreamableFile(buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="${filename.replace(/"/g, "'")}"`
    });
  }

  @Post("from-template")
  createFromTemplate(@Body() dto: CreateFromTemplateDto) {
    return this.service.createFromTemplate(dto);
  }

  @Patch(":id")
  updateDraft(@Param("id") id: string, @Body() dto: UpdateNotificationDraftDto) {
    return this.service.updateDraft(id, dto);
  }

  @Post(":id/transition")
  transition(@Param("id") id: string, @Body() dto: TransitionNotificationDto) {
    return this.service.transition(id, dto);
  }

  @Post(":id/signers")
  setSigners(@Param("id") id: string, @Body() dto: SetSignersDto) {
    return this.service.setSigners(id, dto);
  }

  @Post(":id/sign")
  sign(@Param("id") id: string, @Body() dto: SignNotificationDto) {
    return this.service.sign(id, dto);
  }

  @Post(":id/prepare-send")
  prepareSend(@Param("id") id: string, @Body() dto: SendNotificationDto) {
    return this.service.prepareSend(id, dto);
  }

  @Post(":id/confirm-send")
  confirmSend(@Param("id") id: string, @Body() dto: ConfirmSendDto) {
    return this.service.confirmSend(id, dto);
  }

  @Post(":id/acknowledge")
  acknowledge(@Param("id") id: string) {
    return this.service.acknowledge(id);
  }

  @Post(":id/response")
  saveResponse(@Param("id") id: string, @Body() dto: SaveResponseDto) {
    return this.service.saveResponse(id, dto);
  }

  @Post(":id/responses/:responseId/analyze")
  analyze(
    @Param("id") id: string,
    @Param("responseId") responseId: string,
    @Body() dto: AnalyzeResponseDto
  ) {
    return this.service.analyzeResponse(id, responseId, dto);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Body() dto: CancelOrRectifyDto) {
    return this.service.cancel(id, dto);
  }

  @Post(":id/rectify")
  rectify(@Param("id") id: string, @Body() dto: CancelOrRectifyDto) {
    return this.service.rectify(id, dto);
  }
}
