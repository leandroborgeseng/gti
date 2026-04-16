import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";

import "./chamados-glpi.css";

const chamadosFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--chamados-font-family",
  display: "swap"
});

export default function ChamadosLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css" />
      <div className={chamadosFont.variable}>{children}</div>
    </>
  );
}
