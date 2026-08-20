"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { regenerateContractInternalCode } from "@/lib/api";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  contractId: string;
  internalCode: string | null | undefined;
};

/** Ação excepcional, restrita a ADMIN, que não reutiliza o sequencial do código anterior. */
export function ContractInternalCodeRegenerateButton({ contractId, internalCode }: Props): JSX.Element | null {
  const router = useRouter();
  const permissionsQuery = useMyPermissions();
  const canRegenerate = permissionsQuery.isError
    ? false
    : permissionsQuery.data
      ? permissionsQuery.data.role === "ADMIN" &&
        permissionsQuery.data.keys.includes("contracts.internal_code.regenerate")
      : undefined;
  const [open, setOpen] = useState(false);
  const [justification, setJustification] = useState("");

  const mutation = useMutation({
    mutationFn: () => regenerateContractInternalCode(contractId, justification.trim()),
    onSuccess: (contract) => {
      toast.success(`Código interno regenerado: ${contract.internalCode ?? "novo código emitido"}.`);
      setOpen(false);
      setJustification("");
      router.refresh();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Não foi possível regenerar o código interno.");
    }
  });

  if (canRegenerate !== true) return null;

  function close(): void {
    if (mutation.isPending) return;
    setOpen(false);
    setJustification("");
  }

  const canSubmit = justification.trim().length >= 10 && !mutation.isPending;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Regenerar código interno
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Regenerar código interno"
        description="Esta é uma ação excepcional. O código atual será preservado na auditoria e o sequencial não será reutilizado."
      >
        <div className="space-y-4">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Código interno atual: <strong className="font-mono">{internalCode ?? "não gerado"}</strong>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="contract-regenerate-code-justification">Justificativa (mínimo de 10 caracteres)</Label>
            <Textarea
              id="contract-regenerate-code-justification"
              rows={4}
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              disabled={mutation.isPending}
              placeholder="Explique o motivo da emissão de um novo código interno."
              className="resize-y"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Regenerando…" : "Confirmar regeneração"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
