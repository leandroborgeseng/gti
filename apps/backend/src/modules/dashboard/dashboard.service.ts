import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<unknown> {
    const started = Date.now();
    const [contractAgg, measurementAgg, glosaAgg, governanceGroups, goalGroups] = await Promise.all([
      this.prisma.contract.aggregate({
        where: { deletedAt: null },
        _sum: { totalValue: true }
      }),
      this.prisma.measurement.aggregate({
        where: { deletedAt: null },
        _sum: { totalMeasuredValue: true, totalApprovedValue: true }
      }),
      this.prisma.glosa.aggregate({
        _sum: { value: true }
      }),
      this.prisma.ticketGovernance.groupBy({
        by: ["status"],
        _count: { _all: true }
      }),
      this.prisma.goal.groupBy({
        by: ["status"],
        _count: { _all: true }
      })
    ]);

    const totalContratado = new Prisma.Decimal(contractAgg._sum.totalValue ?? 0);
    const totalExecutado = new Prisma.Decimal(measurementAgg._sum.totalApprovedValue ?? 0);
    const totalGlosado = new Prisma.Decimal(glosaAgg._sum.value ?? 0);
    const economia = totalContratado.sub(totalExecutado);
    const percentualExecucao = totalContratado.gt(0)
      ? totalExecutado.div(totalContratado).mul(100).toDecimalPlaces(2)
      : new Prisma.Decimal(0);

    const governanceCount = (status: string) =>
      governanceGroups.find((g) => g.status === status)?._count._all ?? 0;
    const totalGovernance =
      governanceGroups.reduce((acc, g) => acc + g._count._all, 0) || 1;
    const foraSla = governanceCount("SLA_VIOLATED");
    const escalados = governanceCount("ESCALATED");
    const controladoria = governanceCount("SENT_TO_CONTROLADORIA");
    const dentroSla = Math.max(0, totalGovernance - foraSla - escalados - controladoria);

    const goalCount = (status: string) => goalGroups.find((g) => g.status === status)?._count._all ?? 0;

    const result = {
      totalContratado,
      totalExecutado,
      totalGlosado,
      economiaGerada: economia,
      percentualExecucao,
      governance: {
        dentroSlaPercentual: Number(((dentroSla / totalGovernance) * 100).toFixed(2)),
        foraSlaPercentual: Number(((foraSla / totalGovernance) * 100).toFixed(2)),
        chamadosEscalados: escalados,
        chamadosControladoria: controladoria
      },
      goals: {
        planejadas: goalCount("PLANNED"),
        emAndamento: goalCount("IN_PROGRESS"),
        concluidas: goalCount("COMPLETED")
      }
    };
    if (process.env.GTI_PERF_LOG === "1") {
      console.info(`[perf] dashboard.summary ${Date.now() - started}ms`);
    }
    return result;
  }

  async alerts(): Promise<unknown> {
    const started = Date.now();
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [vencendo, pendentes, featureStats, governanceDue] = await Promise.all([
      this.prisma.contract.findMany({
        where: { deletedAt: null, endDate: { lte: in30, gte: now } },
        select: { id: true, number: true, name: true, endDate: true }
      }),
      this.prisma.measurement.findMany({
        where: { deletedAt: null, status: { in: ["OPEN", "UNDER_REVIEW"] } },
        select: {
          id: true,
          referenceMonth: true,
          referenceYear: true,
          contract: { select: { id: true, number: true, name: true } }
        }
      }),
      this.prisma.contractFeature.groupBy({
        by: ["moduleId"],
        _count: { _all: true },
        where: {
          module: {
            contract: { deletedAt: null, contractType: { in: ["SOFTWARE", "SERVICO"] } }
          }
        }
      }),
      this.prisma.ticketGovernance.findMany({
        where: { resolvedAt: null, slaDeadline: { lte: in30, gte: now } },
        select: { id: true, ticketId: true, slaDeadline: true, status: true }
      })
    ]);

    const validatedByModule = await this.prisma.contractFeature.groupBy({
      by: ["moduleId"],
      _count: { _all: true },
      where: {
        status: "VALIDATED",
        module: {
          contract: { deletedAt: null, contractType: { in: ["SOFTWARE", "SERVICO"] } }
        }
      }
    });

    const modules = await this.prisma.contractModule.findMany({
      where: {
        id: { in: featureStats.map((f) => f.moduleId) }
      },
      select: { id: true, contractId: true, contract: { select: { id: true, number: true, name: true } } }
    });

    const validatedMap = new Map(validatedByModule.map((v) => [v.moduleId, v._count._all]));
    const totalsByContract = new Map<
      string,
      { id: string; number: string; name: string; total: number; validated: number }
    >();

    for (const mod of modules) {
      const total = featureStats.find((f) => f.moduleId === mod.id)?._count._all ?? 0;
      const validated = validatedMap.get(mod.id) ?? 0;
      const current = totalsByContract.get(mod.contractId) ?? {
        id: mod.contract.id,
        number: mod.contract.number,
        name: mod.contract.name,
        total: 0,
        validated: 0
      };
      current.total += total;
      current.validated += validated;
      totalsByContract.set(mod.contractId, current);
    }

    const baixaEntregaList = [...totalsByContract.values()]
      .map((c) => ({
        id: c.id,
        number: c.number,
        name: c.name,
        percentual: c.total > 0 ? (c.validated / c.total) * 100 : 0
      }))
      .filter((x) => x.percentual < 40);

    const result = {
      contratosVencendo30Dias: vencendo,
      medicoesPendentes: pendentes,
      contratosBaixaEntrega: baixaEntregaList,
      chamadosSlaVencendo: governanceDue
    };
    if (process.env.GTI_PERF_LOG === "1") {
      console.info(`[perf] dashboard.alerts ${Date.now() - started}ms`);
    }
    return result;
  }

  async notificationsPlaceholder(): Promise<unknown> {
    return {
      unread: 3,
      items: [
        { id: "n1", type: "ALERTA", message: "Contrato CT-001/2025 vence em 22 dias." },
        { id: "n2", type: "MEDICAO", message: "Medição de abril/2026 aguardando aprovação." },
        { id: "n3", type: "GLOSA", message: "Nova glosa cadastrada para CT-014/2024." }
      ]
    };
  }
}
