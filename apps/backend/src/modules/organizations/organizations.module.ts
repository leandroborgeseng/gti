import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, PrismaService],
  exports: [OrganizationsService]
})
export class OrganizationsModule {}
