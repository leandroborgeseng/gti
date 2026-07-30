import { Injectable } from "@nestjs/common";
import { ContractPricingItemStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export type PricingItemsFinancialReportQuery = {
  organizationId?: string;
  status?: ContractPricingItemStatus;
  /** Competência da medição (opcional): filtra o total medido. */
  year?: number;
  month?: number;
};

export type PricingItemsFinancialReportRow = {
  contractId: string;
  contractNumber: string;
  contractName: string;
  internalCode: string | null;
  organizationName: string | null;
  supplierName: string;
  itemId: string;
  sequence: number;
  typeCode: string;
  typeLabel: string;
  description: string;
  billingKind: string;
  unitLabel: string;
  quantity: string;
  consumedQuantity: string;
  availableBalance: string;
  unitValue: string;
  totalValue: string;
  status: string;
  measuredValueSum: string;
};

@Injectable()
export class PricingItemsFinancialReportService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PricingItemsFinancialReportQuery = {}): Promise<PricingItemsFinancialReportRow[]> {
    const where: Prisma.ContractPricingItemWhereInput = {
      contract: {
        deletedAt: null,
        ...(query.organizationId ? { organizationId: query.organizationId } : {})
      },
      ...(query.status ? { status: query.status } : {})
    };

    const competenceFilter =
      query.year != null &&
      query.month != null &&
      Number.isFinite(query.year) &&
      Number.isFinite(query.month) &&
      query.month >= 1 &&
      query.month <= 12
        ? { referenceYear: Math.floor(query.year), referenceMonth: Math.floor(query.month) }
        : {};

    const items = await this.prisma.contractPricingItem.findMany({
      where,
      include: {
        contract: { include: { organization: { select: { name: true } } } },
        type: { select: { code: true, label: true } },
        unit: { select: { label: true } },
        measurementItems: {
          where: {
            measurement: {
              deletedAt: null,
              ...competenceFilter
            }
          },
          select: { calculatedValue: true }
        }
      },
      orderBy: [{ contract: { number: "asc" } }, { sequence: "asc" }]
    });

    return items.map((item) => {
      const measuredValueSum = item.measurementItems.reduce(
        (sum, measurementItem) => sum.add(measurementItem.calculatedValue),
        new Prisma.Decimal(0)
      );
      const availableBalance = item.quantity.sub(item.consumedQuantity);

      return {
        contractId: item.contractId,
        contractNumber: item.contract.number,
        contractName: item.contract.name,
        internalCode: item.contract.internalCode,
        organizationName: item.contract.organization?.name ?? null,
        supplierName: item.contract.companyName,
        itemId: item.id,
        sequence: item.sequence,
        typeCode: item.type.code,
        typeLabel: item.type.label,
        description: item.description,
        billingKind: item.billingKind,
        unitLabel: item.unit.label,
        quantity: item.quantity.toFixed(4),
        consumedQuantity: item.consumedQuantity.toFixed(4),
        availableBalance: availableBalance.toFixed(4),
        unitValue: item.unitValue.toFixed(4),
        totalValue: item.totalValue.toFixed(2),
        status: item.status,
        measuredValueSum: measuredValueSum.toFixed(2)
      };
    });
  }
}
