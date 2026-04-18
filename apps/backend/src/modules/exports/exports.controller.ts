import { Controller, Get, Header } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import { ExportsService } from "./exports.service";

@Controller("exports")
export class ExportsController {
  constructor(private readonly service: ExportsService) {}

  @Get("contracts.csv")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="contratos.csv"')
  async contractsCsv(): Promise<string> {
    const body = await this.service.contractsCsv();
    return `\ufeff${body}`;
  }

  @Get("measurements.csv")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="medicoes.csv"')
  async measurementsCsv(): Promise<string> {
    const body = await this.service.measurementsCsv();
    return `\ufeff${body}`;
  }

  @Get("glosas.csv")
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="glosas.csv"')
  async glosasCsv(): Promise<string> {
    const body = await this.service.glosasCsv();
    return `\ufeff${body}`;
  }
}
