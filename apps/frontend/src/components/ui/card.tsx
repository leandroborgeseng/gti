import { PropsWithChildren } from "react";

type CardProps = PropsWithChildren<{
  className?: string;
}>;

export function Card({ children, className }: CardProps): JSX.Element {
  const base = "rounded-md border border-slate-200/90 bg-white p-4 shadow-sm";
  return <section className={className ? `${base} ${className}` : base}>{children}</section>;
}
