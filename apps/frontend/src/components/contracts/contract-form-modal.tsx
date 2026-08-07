"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { ContractForm } from "@/components/actions/contract-form";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { reportContractFormLoadFailure, type Contract } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

class ContractFormErrorBoundary extends Component<
  {
    children: ReactNode;
    onReset: () => void;
    onRetry?: () => void;
    onReport?: (error: Error, info: ErrorInfo) => void;
  },
  { error: Error | null; retryKey: number }
> {
  state: { error: Error | null; retryKey: number } = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro ao abrir formulário de contrato", error, info.componentStack);
    this.props.onReport?.(error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Não foi possível abrir o formulário.</p>
          <p className="text-amber-900/90">
            Ocorreu uma falha técnica inesperada. Tente novamente. Se o problema continuar, volte à listagem e abra o
            formulário mais tarde. A regularização de órgão, tipo de contrato e demais campos é feita neste próprio
            formulário de edição.
          </p>
          {this.state.error.message ? (
            <p className="rounded border border-amber-200/80 bg-white/60 px-2 py-1.5 text-xs text-amber-900/80">
              Detalhe: {this.state.error.message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                this.setState((s) => ({ error: null, retryKey: s.retryKey + 1 }));
                this.props.onRetry?.();
              }}
            >
              Tentar novamente
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                this.setState({ error: null, retryKey: 0 });
                this.props.onReset();
              }}
            >
              Voltar
            </Button>
          </div>
        </div>
      );
    }
    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}

type Props = {
  open: boolean;
  /** `null` = novo contrato. */
  contract: Contract | null;
  onClose: () => void;
  /** Chamado após salvar com sucesso (além da invalidação padrão de queries). */
  onSuccess?: () => void;
};

/**
 * Rotina única de criação/edição de contrato (listagem e detalhe).
 */
export function ContractFormModal({ open, contract, onClose, onSuccess }: Props): JSX.Element {
  const qc = useQueryClient();
  const editing = Boolean(contract?.id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        editing
          ? `Editar contrato ${contract?.internalCode || contract?.number || contract?.name || ""}`.trim()
          : "Novo contrato"
      }
      description={
        editing
          ? "Altere os dados e clique em Salvar alterações. Pendências de regularização e mudança de status ocorrem neste formulário."
          : "Preencha os campos obrigatórios. O contrato fica disponível na lista assim que for salvo."
      }
    >
      <ContractFormErrorBoundary
        onReset={onClose}
        onReport={(error) => {
          void reportContractFormLoadFailure({
            action: editing ? "edit" : "create",
            contractId: contract?.id ?? null,
            stage: "error_boundary",
            message: error.message
          }).catch(() => undefined);
        }}
      >
        {open ? (
          <ContractForm
            key={contract?.id ?? "create"}
            initialContract={contract}
            onDismiss={onClose}
            onSuccess={() => {
              void qc.invalidateQueries({ queryKey: queryKeys.contracts });
              void qc.invalidateQueries({ queryKey: queryKeys.suppliers });
              void qc.invalidateQueries({ queryKey: queryKeys.fiscais });
              if (contract?.id) {
                void qc.invalidateQueries({ queryKey: queryKeys.contractFormData(contract.id) });
              }
              onClose();
              onSuccess?.();
            }}
          />
        ) : null}
      </ContractFormErrorBoundary>
    </Modal>
  );
}
