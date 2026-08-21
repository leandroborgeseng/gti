"use client";

import { Suspense, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppBrand } from "@/components/brand/app-brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND } from "@/lib/brand";

type ValidateResult = {
  ok: boolean;
  message?: string;
  document?: {
    number: string;
    subject: string;
    status: string;
    signedAt: string | null;
    organizationLabel: string | null;
    signers: Array<{
      name: string | null;
      jobTitle: string | null;
      orgLabel: string | null;
      signedAt: string | null;
      cpfMasked: string | null;
      verificationCode: string | null;
    }>;
  };
};

function ValidarDocumentoForm(): JSX.Element {
  const params = useSearchParams();
  const [documentNumber, setDocumentNumber] = useState(params.get("doc") ?? params.get("numero") ?? "");
  const [verifier, setVerifier] = useState(params.get("codigo") ?? params.get("verificador") ?? "");
  const [validationCode, setValidationCode] = useState(params.get("validacao") ?? "");
  const [result, setResult] = useState<ValidateResult | null>(null);

  const mutation = useMutation({
    mutationFn: async (): Promise<ValidateResult> => {
      const qs = new URLSearchParams();
      if (documentNumber.trim()) qs.set("documentNumber", documentNumber.trim());
      if (verifier.trim()) qs.set("verifierCode", verifier.trim());
      if (validationCode.trim()) qs.set("validationCode", validationCode.trim());
      const res = await fetch(`/api/public/validate-document?${qs.toString()}`);
      const data = (await res.json()) as ValidateResult;
      if (!res.ok) {
        return { ok: false, message: data.message ?? "Não foi possível validar o documento." };
      }
      return data;
    },
    onSuccess: (data) => setResult(data)
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Validar documento</CardTitle>
        <p className="text-sm text-muted-foreground">
          Confira a autenticidade de documentos emitidos pelo {BRAND.shortName} sem necessidade de login.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="doc-number">Código do documento</Label>
          <Input
            id="doc-number"
            placeholder="Ex.: DOC-SIGTI-0002/2026"
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="doc-verifier">Código verificador</Label>
          <Input
            id="doc-verifier"
            placeholder="Código impresso no documento"
            value={verifier}
            onChange={(e) => setVerifier(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="doc-validation">Código de validação (opcional)</Label>
          <Input
            id="doc-validation"
            placeholder="Se informado no documento"
            value={validationCode}
            onChange={(e) => setValidationCode(e.target.value)}
          />
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={mutation.isPending || !verifier.trim()}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Consultando…" : "Validar"}
        </Button>
        {result ? (
          <div
            className={`rounded-md border px-3 py-3 text-sm ${
              result.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-rose-200 bg-rose-50 text-rose-950"
            }`}
          >
            {result.ok && result.document ? (
              <div className="space-y-2">
                <p className="font-semibold">Documento válido</p>
                <p>
                  {result.document.number} · {result.document.subject}
                </p>
                <p>Situação: {result.document.status}</p>
                {result.document.organizationLabel ? <p>Órgão: {result.document.organizationLabel}</p> : null}
                <ul className="mt-2 space-y-1 border-t border-emerald-200 pt-2">
                  {result.document.signers.map((s, i) => (
                    <li key={i}>
                      {s.name ?? "Signatário"}
                      {s.jobTitle ? ` — ${s.jobTitle}` : ""}
                      {s.signedAt ? ` · ${new Date(s.signedAt).toLocaleString("pt-BR")}` : ""}
                      {s.cpfMasked ? ` · CPF ${s.cpfMasked}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p>{result.message ?? "Documento não encontrado ou códigos inválidos."}</p>
            )}
          </div>
        ) : null}
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/login" className="underline">
            Voltar ao login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function ValidarDocumentoPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <AppBrand variant="login" linkHome={false} />
        <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Carregando…</p>}>
          <ValidarDocumentoForm />
        </Suspense>
      </div>
    </main>
  );
}
