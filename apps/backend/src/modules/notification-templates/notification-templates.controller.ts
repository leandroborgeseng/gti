import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import { CreateNotificationTemplateDto, UpdateNotificationTemplateDto } from "./notification-templates.dto";
import { NotificationTemplatesService } from "./notification-templates.service";

@Controller("notification-templates")
export class NotificationTemplatesController {
  constructor(private readonly service: NotificationTemplatesService) {}

  @Get("mail-merge-fields")
  mailMergeFields() {
    return { fields: this.service.mailMergeFields() };
  }

  @Get()
  findAll(@Query("includeInactive") includeInactive?: string) {
    return this.service.findAll(includeInactive === "1" || includeInactive === "true");
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateNotificationTemplateDto) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdateNotificationTemplateDto) {
    return this.service.update(id, dto);
  }

  @Post(":id/deactivate")
  @Roles(UserRole.ADMIN)
  deactivate(@Param("id") id: string) {
    return this.service.deactivate(id);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
