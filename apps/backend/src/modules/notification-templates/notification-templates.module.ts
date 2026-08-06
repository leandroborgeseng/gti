import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationTemplatesController } from "./notification-templates.controller";
import { NotificationTemplatesService } from "./notification-templates.service";

@Module({
  controllers: [NotificationTemplatesController],
  providers: [NotificationTemplatesService, PrismaService],
  exports: [NotificationTemplatesService]
})
export class NotificationTemplatesModule {}
