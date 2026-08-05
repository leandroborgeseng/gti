import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PricingItemsFinancialReportService } from "../reports/pricing-items-financial-report.service";

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
        totalValue: true,
        installationValue: true
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
      "valor_total",
      "valor_implantacao"
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
        csvCell(r.totalValue.toString()),
        csvCell(r.installationValue != null ? r.installationValue.toString() : "")
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

  async contractAmendmentsCsv(): Promise<string> {
    const rows = await this.prisma.contractAmendment.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        contractId: true,
        type: true,
        status: true,
        referenceCode: true,
        formalizationDate: true,
        effectiveDate: true,
        description: true,
        previousTotalValue: true,
        previousMonthlyValue: true,
        previousEndDate: true,
        previousGlobalValue: true,
        newTotalValue: true,
        newMonthlyValue: true,
        newEndDate: true,
        newGlobalValue: true,
        adjustmentPercent: true,
        createdAt: true,
        contract: { select: { number: true, name: true, status: true } }
      }
    });
    const header = [
      "id",
      "contract_id",
      "contrato_numero",
      "contrato_nome",
      "contrato_status",
      "tipo",
      "status_aditivo",
      "referencia_instrumento",
      "formalizacao",
      "inicio_efeitos",
      "descricao",
      "valor_mensal_anterior",
      "valor_mensal_novo",
      "valor_total_anterior",
      "valor_total_novo",
      "valor_global_anterior",
      "valor_global_novo",
      "percentual_ajuste",
      "termino_anterior",
      "termino_novo",
      "registrado_em"
    ].join(",");
    const lines = rows.map((r) =>
      [
        csvCell(r.id),
        csvCell(r.contractId),
        csvCell(r.contract.number),
        csvCell(r.contract.name),
        csvCell(r.contract.status),
        csvCell(r.type),
        csvCell(r.status),
        csvCell(r.referenceCode ?? ""),
        csvCell(r.formalizationDate ? r.formalizationDate.toISOString().slice(0, 10) : ""),
        csvCell(r.effectiveDate.toISOString().slice(0, 10)),
        csvCell(r.description),
        csvCell(r.previousMonthlyValue.toString()),
        csvCell(r.newMonthlyValue?.toString() ?? ""),
        csvCell(r.previousTotalValue.toString()),
        csvCell(r.newTotalValue?.toString() ?? ""),
        csvCell(r.previousGlobalValue?.toString() ?? ""),
        csvCell(r.newGlobalValue?.toString() ?? ""),
        csvCell(r.adjustmentPercent?.toString() ?? ""),
        csvCell(r.previousEndDate.toISOString().slice(0, 10)),
        csvCell(r.newEndDate ? r.newEndDate.toISOString().slice(0, 10) : ""),
        csvCell(r.createdAt.toISOString())
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

  async pricingItemsCsv(): Promise<string> {
    const rows = await new PricingItemsFinancialReportService(this.prisma).list();
    const header = [
      "contrato_numero",
      "contrato_nome",
      "codigo_interno",
      "orgao",
      "fornecedor",
      "item_sequencia",
      "tipo_codigo",
      "tipo",
      "descricao",
      "cobranca",
      "unidade",
      "quantidade",
      "consumido",
      "saldo_disponivel",
      "valor_unitario",
      "valor_total",
      "status",
      "valor_medido"
    ].join(",");
    const lines = rows.map((row) =>
      [
        row.contractNumber,
        row.contractName,
        row.internalCode ?? "",
        row.organizationName ?? "",
        row.supplierName,
        String(row.sequence),
        row.typeCode,
        row.typeLabel,
        row.description,
        row.billingKind,
        row.unitLabel,
        row.quantity,
        row.consumedQuantity,
        row.availableBalance,
        row.unitValue,
        row.totalValue,
        row.status,
        row.measuredValueSum
      ]
        .map(csvCell)
        .join(",")
    );
    return [header, ...lines].join("\n");
  }
}
