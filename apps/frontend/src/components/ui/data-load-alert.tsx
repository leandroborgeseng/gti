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
        A API de gestão corre no <strong className="font-medium text-amber-950">mesmo Next</strong> (<span className="font-mono text-[11px]">/api/…</span>).
        Confirme <span className="font-mono text-[11px]">DATABASE_URL</span>, <span className="font-mono text-[11px]">JWT_SECRET</span> e
        sessão (saia e entre de novo). Se definiu <span className="font-mono text-[11px]">NEXT_PUBLIC_BACKEND_URL</span> para outro host,
        esse host tem de estar acessível. Opcional: <span className="font-mono text-[11px]">BACKEND_FETCH_TIMEOUT_MS</span>.
      </p>
    </div>
  );
}
