import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

function csvCell(value: string): string {
  const v = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService) {}

  async contractsCsv(): Promise<string> {
    const rows = await this.prisma.contract.findMany({
      where: { deletedAt: null },
      orderBy: { number: "asc" },
      select: {
        number: true,
        name: true,
        companyName: true,
        cnpj: true,
        contractType: true,
        lawType: true,
        status: true,
        startDate: true,
        endDate: true,
        monthlyValue: true,
        totalValue: true
      }
    });
    const header = [
      "numero",
      "nome",
      "fornecedor",
      "cnpj",
      "tipo",
      "lei",
      "status",
      "inicio",
      "fim",
      "valor_mensal",
      "valor_total"
    ].join(",");
    const lines = rows.map((r) =>
      [
        csvCell(r.number),
        csvCell(r.name),
        csvCell(r.companyName),
        csvCell(r.cnpj),
        csvCell(r.contractType),
        csvCell(r.lawType),
        csvCell(r.status),
        csvCell(r.startDate.toISOString().slice(0, 10)),
        csvCell(r.endDate.toISOString().slice(0, 10)),
        csvCell(r.monthlyValue.toString()),
        csvCell(r.totalValue.toString())
      ].join(",")
    );
    return [header, ...lines].join("\n");
  }
}
