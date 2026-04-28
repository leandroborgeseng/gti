import type { Route } from "next";
import Link from "next/link";
import { ContractFinancialSnapshotsPanel } from "@/components/contracts/contract-financial-snapshots-panel";
import { ContractAmendmentsPanel } from "@/components/contracts/contract-amendments-panel";
import { ContractGlpiGroupsPanel } from "@/components/contracts/contract-glpi-groups-panel";
import { ContractItemChangeHistoryPanel } from "@/components/contracts/contract-item-change-history-panel";
import { ContractStatusControl } from "@/components/contracts/contract-status-control";
import { ContractImplantationProportionPanel } from "@/components/contracts/contract-implantation-proportion-panel";
import { ContractStructureEditor } from "@/components/contracts/contract-structure-editor";
import { Card } from "@/components/ui/card";
import { DataLoadAlert } from "@/components/ui/data-load-alert";
import { formatBrl } from "@/lib/format-brl";
import { getContract } from "@/lib/api";
import { safeLoadNullable } from "@/lib/api-load";

const statusLabel: Record<string, string> = {
  ACTIVE: "Ativo",
  EXPIRED: "Encerrado",
  SUSPENDED: "Suspenso"
};

const contractTypeLabel: Record<string, string> = {
  SOFTWARE: "Software",
  DATACENTER: "Datacenter",
  INFRA: "Infraestrutura",
  SERVICO: "Serviço"
};

const lawTypeLabel: Record<string, string> = {
  LEI_8666: "Lei 8.666/1993",
  LEI_14133: "Lei 14.133/2021"
};

function formatSlaTarget(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") {
    return "—";
  }
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) {
    return "—";
  }
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

export default async function ContractDetailPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const { data: contract, error } = await safeLoadNullable(() => getContract(params.id));
  if (error) {
    return (
      <div className="space-y-4">
        <DataLoadAlert messages={[error]} title="Não foi possível carregar o contrato" />
        <p className="text-sm">
          <Link
            href={"/contracts" as Route}
            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
          >
            Voltar à lista de contratos
          </Link>
        </p>
      </div>
    );
  }
  if (!contract) {
    return (
      <Card>
        <p className="text-sm text-slate-600">Contrato não encontrado.</p>
      </Card>
    );
  }

  const cnpj = contract.cnpj ?? contract.supplier?.cnpj ?? "—";
  const law = contract.lawType ? lawTypeLabel[contract.lawType] ?? contract.lawType : "—";
  const tipo = contractTypeLabel[contract.contractType] ?? contract.contractType;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href={"/contracts" as Route}
          className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
        >
          ← Voltar aos contratos
        </Link>
        <span className="text-slate-300" aria-hidden>
          |
        </span>
        <Link
          href={`/measurements?contractId=${contract.id}` as Route}
          className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
        >
          Medições deste contrato
        </Link>
      </div>

      <Card className="p-5">
        <h1 className="text-xl font-semibold text-slate-900">
          {contract.number} — {contract.name}
        </h1>
        {contract.description ? <p className="mt-2 text-sm text-slate-600">{contract.description}</p> : null}

        <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
          {contract.managingUnit ? (
            <p className="md:col-span-2">
              <strong className="text-slate-900">Órgão gestor:</strong> {contract.managingUnit}
            </p>
          ) : null}
          <p>
            <strong className="text-slate-900">Contratante (razão social):</strong> {contract.companyName}
          </p>
          {contract.supplier ? (
            <p>
              <strong className="text-slate-900">Empresa terceirizada:</strong> {contract.supplier.name}
            </p>
          ) : null}
          <p>
            <strong className="text-slate-900">CNPJ (contrato):</strong> {cnpj}
          </p>
          <div className="flex flex-col gap-1 md:flex-row md:flex-wrap md:items-start md:gap-x-3 md:gap-y-1">
            <p>
              <strong className="text-slate-900">Status:</strong> {statusLabel[contract.status] ?? contract.status}
            </p>
            <ContractStatusControl contractId={contract.id} status={contract.status} />
          </div>
          <p>
            <strong className="text-slate-900">Tipo:</strong> {tipo}
          </p>
          <p>
            <strong className="text-slate-900">Legislação:</strong> {law}
          </p>
          <p>
            <strong className="text-slate-900">Vigência:</strong>{" "}
            {new Date(contract.startDate).toLocaleDateString("pt-BR")} a{" "}
            {new Date(contract.endDate).toLocaleDateString("pt-BR")}
          </p>
          <p>
            <strong className="text-slate-900">Mensalidade:</strong> {formatBrl(contract.monthlyValue)}
          </p>
          <p>
            <strong className="text-slate-900">Implantação:</strong> {formatBrl(contract.installationValue)}
          </p>
          {contract.implementationPeriodStart || contract.implementationPeriodEnd ? (
            <p>
              <strong className="text-slate-900">Período de implantação:</strong>{" "}
              {contract.implementationPeriodStart
                ? new Date(contract.implementationPeriodStart).toLocaleDateString("pt-BR")
                : "—"}{" "}
              a{" "}
              {contract.implementationPeriodEnd
                ? new Date(contract.implementationPeriodEnd).toLocaleDateString("pt-BR")
                : "—"}
            </p>
          ) : null}
          <p>
            <strong className="text-slate-900">Valor total:</strong> {formatBrl(contract.totalValue)}
          </p>
          <p>
            <strong className="text-slate-900">Meta de SLA (referência):</strong> {formatSlaTarget(contract.slaTarget ?? undefined)}
          </p>
        </div>

        <div className="mt-6 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fiscal</p>
            <p className="mt-1 text-sm text-slate-800">{contract.fiscal?.name ?? "—"}</p>
            {contract.fiscal?.email ? (
              <a href={`mailto:${contract.fiscal.email}`} className="text-xs text-slate-600 underline">
                {contract.fiscal.email}
              </a>
            ) : null}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gestor</p>
            <p className="mt-1 text-sm text-slate-800">{contract.manager?.name ?? "—"}</p>
            {contract.manager?.email ? (
              <a href={`mailto:${contract.manager.email}`} className="text-xs text-slate-600 underline">
                {contract.manager.email}
              </a>
            ) : null}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fornecedor cadastrado</p>
            <p className="mt-1 text-sm text-slate-800">{contract.supplier?.name ?? "—"}</p>
            {contract.supplier?.cnpj ? <p className="text-xs text-slate-600">{contract.supplier.cnpj}</p> : null}
          </div>
        </div>
      </Card>

      <ContractFinancialSnapshotsPanel
        contractId={contract.id}
        snapshots={contract.financialSnapshots}
        currentMonthly={contract.monthlyValue}
      />

      <ContractImplantationProportionPanel data={contract.featureImplantationProportion} />

      <ContractGlpiGroupsPanel contractId={contract.id} initialGroups={contract.glpiGroups ?? []} />

      <ContractAmendmentsPanel contract={contract} />

      <ContractStructureEditor contract={contract} />

      <ContractItemChangeHistoryPanel logs={contract.itemChangeLogs ?? []} />
    </div>
  );
}
