import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<unknown> {
    const [contracts, measurements, glosas, governance, goals] = await Promise.all([
      this.prisma.contract.findMany({ where: { deletedAt: null }, select: { totalValue: true } }),
      this.prisma.measurement.findMany({ where: { deletedAt: null }, select: { totalMeasuredValue: true, totalApprovedValue: true } }),
      this.prisma.glosa.findMany({ select: { value: true } }),
      this.prisma.ticketGovernance.findMany({ select: { status: true } }),
      this.prisma.goal.findMany({ select: { status: true } })
    ]);
    const totalContratado = contracts.reduce((acc, c) => acc.add(c.totalValue), new Prisma.Decimal(0));
    const totalExecutado = measurements.reduce((acc, m) => acc.add(m.totalApprovedValue), new Prisma.Decimal(0));
    const totalGlosado = glosas.reduce((acc, g) => acc.add(g.value), new Prisma.Decimal(0));
    const economia = totalContratado.sub(totalExecutado);
    const percentualExecucao =
      totalContratado.gt(0) ? totalExecutado.div(totalContratado).mul(100).toDecimalPlaces(2) : new Prisma.Decimal(0);
    const totalGovernance = governance.length || 1;
    const dentroSla = governance.filter((t) => !["SLA_VIOLATED", "ESCALATED", "SENT_TO_CONTROLADORIA"].includes(t.status)).length;
    const foraSla = governance.filter((t) => t.status === "SLA_VIOLATED").length;
    const escalados = governance.filter((t) => t.status === "ESCALATED").length;
    const controladoria = governance.filter((t) => t.status === "SENT_TO_CONTROLADORIA").length;

    return {
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
        planejadas: goals.filter((g) => g.status === "PLANNED").length,
        emAndamento: goals.filter((g) => g.status === "IN_PROGRESS").length,
        concluidas: goals.filter((g) => g.status === "COMPLETED").length
      }
    };
  }

  async alerts(): Promise<unknown> {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [vencendo, pendentes, baixaEntrega, governanceDue] = await Promise.all([
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
      this.prisma.contract.findMany({
        where: { deletedAt: null, contractType: { in: ["SOFTWARE", "SERVICO"] } },
        include: { modules: { include: { features: true } } }
      }),
      this.prisma.ticketGovernance.findMany({
        where: { resolvedAt: null, slaDeadline: { lte: in30, gte: now } },
        select: { id: true, ticketId: true, slaDeadline: true, status: true }
      })
    ]);

    const baixaEntregaList = baixaEntrega
      .map((c) => {
        const features = c.modules.flatMap((m) => m.features);
        const total = features.length;
        const validated = features.filter((f) => f.status === "VALIDATED").length;
        const percentual = total > 0 ? (validated / total) * 100 : 0;
        return { id: c.id, number: c.number, name: c.name, percentual };
      })
      .filter((x) => x.percentual < 40);

    return {
      contratosVencendo30Dias: vencendo,
      medicoesPendentes: pendentes,
      contratosBaixaEntrega: baixaEntregaList,
      chamadosSlaVencendo: governanceDue
    };
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
