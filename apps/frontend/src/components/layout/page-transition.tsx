import { PropsWithChildren } from "react";

/** Wrapper da área de conteúdo do shell, sem animação para manter navegação leve. */
export function PageTransition({ children }: PropsWithChildren): JSX.Element {
  return <div className="w-full">{children}</div>;
}
