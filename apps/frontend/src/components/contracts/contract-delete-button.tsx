"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AuthMe } from "@/lib/api";
import { deleteContract, getAuthMe } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  contractId: string;
  contractNumber: string;
  contractName: string;
};

/**
 * Ação destrutiva restrita a administradores: exclusão com confirmação textual e justificativa.
 */
export function ContractDeleteButton({ contractId, contractNumber, contractName }: Props): JSX.Element | null {
  const router = useRouter();
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [justification, setJustification] = useState("");

  useEffect(() => {
    void getAuthMe()
      .then((m: AuthMe) => setRole(m.role))
      .catch(() => setRole(null));
  }, []);

  const mut = useMutation({
    mutationFn: () =>
      deleteContract(contractId, {
        confirmation: confirmation.trim(),
        justification: justification.trim()
      }),
    onSuccess: () => {
      toast.success("Contrato excluído.");
      setOpen(false);
      router.push("/contracts");
      router.refresh();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o contrato.");
    }
  });

  if (role === undefined || role !== "ADMIN") {
    return null;
  }

  const confirmOk =
    confirmation.trim().toUpperCase() === "EXCLUIR" || confirmation.trim() === contractNumber.trim();
  const justificationOk = justification.trim().length >= 5;
  const canSubmit = confirmOk && justificationOk && !mut.isPending;

  function close(): void {
    if (mut.isPending) return;
    setOpen(false);
    setConfirmation("");
    setJustification("");
  }

  return (
    <>
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Excluir contrato
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Excluir contrato"
        description="Esta ação remove o contrato da listagem e pode ser irreversível. Contratos com medições, aditivos ou outros vínculos não podem ser excluídos."
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Você está prestes a excluir o contrato{" "}
            <strong className="font-semibold text-slate-900">
              {contractNumber} — {contractName}
            </strong>
            .
          </p>
          <p className="text-sm text-amber-900">
            Se o contrato já tiver movimentações, use «Suspenso» ou «Encerrado» em vez de excluir.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="contract-delete-confirm">
              Digite <span className="font-mono font-semibold">EXCLUIR</span> ou o número do contrato (
              <span className="font-mono">{contractNumber}</span>)
            </Label>
            <Input
              id="contract-delete-confirm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              disabled={mut.isPending}
              placeholder="EXCLUIR"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contract-delete-justification">Justificativa (obrigatória)</Label>
            <Textarea
              id="contract-delete-justification"
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              disabled={mut.isPending}
              placeholder="Ex.: cadastro de teste ou contrato duplicado"
              className="resize-y"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={close} disabled={mut.isPending}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!canSubmit}
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? "Excluindo…" : "Confirmar exclusão"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
