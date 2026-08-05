import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogsController } from "./audit-logs.controller";
import { AuditLogsService } from "./audit-logs.service";

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, PrismaService],
  exports: [AuditLogsService]
})
export class AuditLogsModule {}
