import { PropsWithChildren } from "react";

type CardProps = PropsWithChildren<{
  className?: string;
}>;

export function Card({ children, className }: CardProps): JSX.Element {
  const base = "rounded-xl border border-border bg-white p-4 shadow-sm";
  return <section className={className ? `${base} ${className}` : base}>{children}</section>;
}
