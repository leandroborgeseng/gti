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

  async measurementsCsv(): Promise<string> {
    const rows = await this.prisma.measurement.findMany({
      where: { deletedAt: null },
      orderBy: [{ referenceYear: "desc" }, { referenceMonth: "desc" }],
      select: {
        id: true,
        contractId: true,
        referenceMonth: true,
        referenceYear: true,
        status: true,
        totalMeasuredValue: true,
        totalApprovedValue: true,
        totalGlosedValue: true,
        contract: { select: { number: true, name: true } }
      }
    });
    const header = [
      "id",
      "contrato_numero",
      "contrato_nome",
      "contract_id",
      "mes",
      "ano",
      "status",
      "valor_medido",
      "valor_aprovado",
      "valor_glosado"
    ].join(",");
    const lines = rows.map((r) =>
      [
        csvCell(r.id),
        csvCell(r.contract?.number ?? ""),
        csvCell(r.contract?.name ?? ""),
        csvCell(r.contractId),
        csvCell(String(r.referenceMonth)),
        csvCell(String(r.referenceYear)),
        csvCell(r.status),
        csvCell(r.totalMeasuredValue.toString()),
        csvCell(r.totalApprovedValue.toString()),
        csvCell(r.totalGlosedValue.toString())
      ].join(",")
    );
    return [header, ...lines].join("\n");
  }

  async glosasCsv(): Promise<string> {
    const rows = await this.prisma.glosa.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        measurementId: true,
        type: true,
        value: true,
        justification: true,
        createdBy: true,
        createdAt: true,
        measurement: {
          select: {
            referenceMonth: true,
            referenceYear: true,
            contract: { select: { number: true, name: true } }
          }
        }
      }
    });
    const header = [
      "id",
      "medicao_id",
      "contrato_numero",
      "contrato_nome",
      "competencia_mes",
      "competencia_ano",
      "tipo",
      "valor",
      "justificativa",
      "criado_por",
      "criado_em"
    ].join(",");
    const lines = rows.map((r) =>
      [
        csvCell(r.id),
        csvCell(r.measurementId),
        csvCell(r.measurement.contract?.number ?? ""),
        csvCell(r.measurement.contract?.name ?? ""),
        csvCell(String(r.measurement.referenceMonth)),
        csvCell(String(r.measurement.referenceYear)),
        csvCell(r.type),
        csvCell(r.value.toString()),
        csvCell(r.justification),
        csvCell(r.createdBy),
        csvCell(r.createdAt.toISOString())
      ].join(",")
    );
    return [header, ...lines].join("\n");
  }
}
