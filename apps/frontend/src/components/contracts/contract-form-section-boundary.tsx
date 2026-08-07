"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ContractFormLoadStage } from "@/modules/contracts/contract-form-load";

type Props = {
  children: ReactNode;
  /** Rótulo amigável da seção (exibido ao usuário). */
  label: string;
  stage: ContractFormLoadStage;
  onReport?: (stage: ContractFormLoadStage, message: string) => void;
};

type State = { error: Error | null; retryKey: number };

/**
 * Isola falhas de renderização de uma seção do formulário,
 * sem derrubar a tela inteira.
 */
export class ContractFormSectionBoundary extends Component<Props, State> {
  state: State = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[contract-form] seção «${this.props.stage}»`, error, info.componentStack);
    this.props.onReport?.(
      this.props.stage,
      error.message || `Falha de renderização em ${this.props.stage}`
    );
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">Não foi possível carregar a seção «{this.props.label}».</p>
          <p className="mt-1 text-amber-900/90">
            O restante do formulário continua disponível. Tente novamente esta seção ou prossiga com os demais campos.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => this.setState((s) => ({ error: null, retryKey: s.retryKey + 1 }))}
          >
            Tentar novamente
          </Button>
        </div>
      );
    }
    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}
