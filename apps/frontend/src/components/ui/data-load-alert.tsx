type Props = {
  /** Uma ou várias mensagens (ex.: falhas em paralelo). */
  messages: string[];
  /** Texto curto do título; omissão usa formulário neutro. */
  title?: string;
};

/** Exportado para títulos em páginas (ex. dashboard) alinhados ao tipo de falha. */
export function looksLikeGestaoAuthError(messages: string[]): boolean {
  return messages.some((m) => /401|403|n[aã]o autenticad|sess[aã]o|token|jwt|unauthoriz|forbidden/i.test(m));
}

/**
 * Aviso visível quando o carregamento de dados da API falhou (rede, 401, 502, etc.).
 * Usar em páginas servidor e em vistas cliente.
 */
export function DataLoadAlert({ messages, title = "Não foi possível carregar dados" }: Props): JSX.Element | null {
  if (!messages.length) {
    return null;
  }
  const authHint = looksLikeGestaoAuthError(messages);
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
      {authHint ? (
        <p className="mt-3 text-xs leading-relaxed text-amber-900/80">
          Em primeiro lugar: <strong className="font-medium text-amber-950">sessão</strong>. Use <strong>Sair</strong> e volte a entrar em{" "}
          <span className="font-mono text-[11px]">/login</span> com um utilizador válido. O mesmo{" "}
          <span className="font-mono text-[11px]">JWT_SECRET</span> tem de estar definido no servidor onde corre o Next (ex. Railway).
        </p>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-amber-900/80">
          A gestão contratual responde nas rotas <span className="font-mono text-[11px]">/api/…</span> deste Next. Confirme{" "}
          <span className="font-mono text-[11px]">DATABASE_URL</span> (PostgreSQL acessível) e{" "}
          <span className="font-mono text-[11px]">JWT_SECRET</span>. Só precisa de{" "}
          <span className="font-mono text-[11px]">NEXT_PUBLIC_BACKEND_URL</span> se a API estiver noutro domínio (acessível ao browser e ao servidor). Opcional:{" "}
          <span className="font-mono text-[11px]">BACKEND_FETCH_TIMEOUT_MS</span>.
        </p>
      )}
    </div>
  );
}
