type Props = {
  /** Uma ou várias mensagens (ex.: falhas em paralelo). */
  messages: string[];
  /** Texto curto do título; omissão usa formulário neutro. */
  title?: string;
};

/**
 * Aviso visível quando o carregamento de dados da API falhou (rede, 401, 502, backend parado).
 * Usar em páginas servidor e em vistas cliente.
 */
export function DataLoadAlert({ messages, title = "Não foi possível carregar dados" }: Props): JSX.Element | null {
  if (!messages.length) {
    return null;
  }
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
    >
      <p className="font-semibold text-amber-950">{title}</p>
      {messages.length === 1 ? (
        <p className="mt-2 text-amber-900/95">{messages[0]}</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900/95">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs leading-relaxed text-amber-900/80">
        <strong className="font-medium text-amber-950">Um só serviço</strong> (<span className="font-mono text-[11px]">npm start</span> na
        raiz): o Nest corre na mesma máquina — <strong className="font-medium text-amber-950">apague</strong>{" "}
        <span className="font-mono text-[11px]">BACKEND_API_BASE_URL</span> e{" "}
        <span className="font-mono text-[11px]">NEXT_PUBLIC_BACKEND_URL</span> se apontarem para um host errado ou{" "}
        <span className="font-mono text-[11px]">localhost</span>, depois redeploy.{" "}
        <strong className="font-medium text-amber-950">Nest noutro serviço</strong>: defina{" "}
        <span className="font-mono text-[11px]">BACKEND_API_BASE_URL</span> (URL interno ou público, termina em{" "}
        <span className="font-mono text-[11px]">/api</span>) e <span className="font-mono text-[11px]">GTI_SKIP_NEST=1</span>. «Timeout»
        ou «aborted» com URL externo errado é comum. Confirme sessão (saia e entre de novo). Opcional:{" "}
        <span className="font-mono text-[11px]">BACKEND_FETCH_TIMEOUT_MS</span> (ms) para pedidos lentos ao arranque.
      </p>
    </div>
  );
}
