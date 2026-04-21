import { BadRequestException, Injectable } from "@nestjs/common";
import { ContractStatus, MeasurementStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export type MonthlyContractClosureRow = {
  contractId: string;
  contractNumber: string;
  contractName: string;
  contractStatus: string;
  contractTotalValue: string;
  contractMonthlyValue: string;
  contractInstallationValue: string | null;
  implementationPeriodStart: string | null;
  implementationPeriodEnd: string | null;
  /** Referência de pagamento no mês anterior (medição aprovada, se existir). */
  previousMonthApprovedPayment: string | null;
  /** Estado da medição do mês de referência. */
  measurementStatus: string | null;
  /** Valor aprovado no mês (medição aprovada). */
  monthApprovedPayment: string | null;
  /** Valor medido/calculado no mês (independente do estado). */
  monthMeasuredValue: string | null;
  glpiOsOpenedInMonth: number;
  glpiOsClosedInMonth: number;
  /** OS ainda abertas criadas antes deste mês (represadas). */
  glpiOsOpenBacklog: number;
};

function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function monthUtcRange(year: number, month: number): { startMs: number; endMs: number } {
  const startMs = Date.UTC(year, month - 1, 1, 0, 0, 0, 0);
  const endMs = Date.UTC(year, month, 0, 23, 59, 59, 999);
  return { startMs, endMs };
}

function parseTicketDate(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Heurística para estados GLPI típicos de chamado encerrado (instâncias em PT/EN). */
function isClosedGlpiStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return (
    s.includes("fechad") ||
    s.includes("encerrad") ||
    s.includes("solucion") ||
    s.includes("resolv") ||
    s.includes("closed") ||
    s.includes("conclu") ||
    s.includes("arquivad") ||
    s.includes("cancelad")
  );
}

@Injectable()
export class MonthlyContractClosureReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(year: number, month: number): Promise<MonthlyContractClosureRow[]> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException("Ano inválido.");
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException("Mês inválido (1–12).");
    }

    const { startMs, endMs } = monthUtcRange(year, month);
    const pm = prevMonth(year, month);

    const contracts = await this.prisma.contract.findMany({
      where: {
        deletedAt: null,
        status: ContractStatus.ACTIVE,
        startDate: { lte: new Date(endMs) },
        endDate: { gte: new Date(startMs) }
      },
      select: {
        id: true,
        number: true,
        name: true,
        status: true,
        totalValue: true,
        monthlyValue: true,
        installationValue: true,
        implementationPeriodStart: true,
        implementationPeriodEnd: true,
        glpiGroups: { select: { glpiGroupId: true } }
      },
      orderBy: { number: "asc" }
    });

    const contractIds = contracts.map((c) => c.id);
    if (contractIds.length === 0) {
      return [];
    }

    const measurements = await this.prisma.measurement.findMany({
      where: {
        deletedAt: null,
        contractId: { in: contractIds },
        OR: [
          { referenceYear: year, referenceMonth: month },
          { referenceYear: pm.year, referenceMonth: pm.month }
        ]
      },
      select: {
        contractId: true,
        referenceYear: true,
        referenceMonth: true,
        status: true,
        totalApprovedValue: true,
        totalMeasuredValue: true
      }
    });

    const measKey = (cid: string, y: number, m: number) => `${cid}:${y}:${m}`;
    const measMap = new Map<string, (typeof measurements)[0]>();
    for (const row of measurements) {
      measMap.set(measKey(row.contractId, row.referenceYear, row.referenceMonth), row);
    }

    const groupLinks = await this.prisma.contractGlpiGroup.findMany({
      where: { contractId: { in: contractIds } },
      select: { contractId: true, glpiGroupId: true }
    });

    const groupToContractIds = new Map<number, Set<string>>();
    const allGroupIds = new Set<number>();
    for (const l of groupLinks) {
      allGroupIds.add(l.glpiGroupId);
      const set = groupToContractIds.get(l.glpiGroupId) ?? new Set<string>();
      set.add(l.contractId);
      groupToContractIds.set(l.glpiGroupId, set);
    }

    const tickets =
      allGroupIds.size === 0
        ? []
        : await this.prisma.ticket.findMany({
            where: { contractGroupId: { in: Array.from(allGroupIds) } },
            select: {
              contractGroupId: true,
              status: true,
              dateCreation: true,
              dateModification: true,
              updatedAt: true
            }
          });

    const countForContract = (contractId: string) => {
      const groupsForC = new Set(groupLinks.filter((g) => g.contractId === contractId).map((g) => g.glpiGroupId));
      let opened = 0;
      let closed = 0;
      let backlog = 0;
      for (const t of tickets) {
        if (t.contractGroupId == null || !groupsForC.has(t.contractGroupId)) continue;
        const cMs = parseTicketDate(t.dateCreation);
        const modMs = parseTicketDate(t.dateModification) ?? (t.updatedAt instanceof Date ? t.updatedAt.getTime() : null);
        const closedNow = isClosedGlpiStatus(t.status);
        if (cMs != null && cMs >= startMs && cMs <= endMs) {
          opened += 1;
        }
        if (closedNow && modMs != null && modMs >= startMs && modMs <= endMs) {
          closed += 1;
        }
        if (!closedNow && cMs != null && cMs < startMs) {
          backlog += 1;
        }
      }
      return { opened, closed, backlog };
    };

    return contracts.map((c) => {
      const cur = measMap.get(measKey(c.id, year, month));
      const prev = measMap.get(measKey(c.id, pm.year, pm.month));
      const counts = countForContract(c.id);

      const prevPay =
        prev?.status === MeasurementStatus.APPROVED ? prev.totalApprovedValue.toFixed(2) : prev ? null : null;

      const monthPay =
        cur?.status === MeasurementStatus.APPROVED ? cur.totalApprovedValue.toFixed(2) : cur ? null : null;

      const monthMeasured = cur ? cur.totalMeasuredValue.toFixed(2) : null;

      return {
        contractId: c.id,
        contractNumber: c.number,
        contractName: c.name,
        contractStatus: c.status,
        contractTotalValue: c.totalValue.toFixed(2),
        contractMonthlyValue: c.monthlyValue.toFixed(2),
        contractInstallationValue: c.installationValue != null ? c.installationValue.toFixed(2) : null,
        implementationPeriodStart: c.implementationPeriodStart
          ? c.implementationPeriodStart.toISOString().slice(0, 10)
          : null,
        implementationPeriodEnd: c.implementationPeriodEnd ? c.implementationPeriodEnd.toISOString().slice(0, 10) : null,
        previousMonthApprovedPayment: prevPay,
        measurementStatus: cur?.status ?? null,
        monthApprovedPayment: monthPay,
        monthMeasuredValue: monthMeasured,
        glpiOsOpenedInMonth: counts.opened,
        glpiOsClosedInMonth: counts.closed,
        glpiOsOpenBacklog: counts.backlog
      };
    });
  }
}
