import { NextResponse } from "next/server";
import { prisma } from "@/glpi/config/prisma";

export const dynamic = "force-dynamic";

/** Catálogos públicos para a tela «Solicitar acesso» (sem autenticação). */
export async function GET(): Promise<NextResponse> {
  const [organizations, suppliers] = await Promise.all([
    prisma.organization.findMany({
      where: { active: true },
      orderBy: [{ acronym: "asc" }, { name: "asc" }],
      select: { id: true, name: true, acronym: true }
    }),
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, cnpj: true }
    })
  ]);

  return NextResponse.json({
    organizations: organizations.map((o) => ({
      id: o.id,
      label: o.acronym ? `${o.acronym} · ${o.name}` : o.name
    })),
    suppliers: suppliers.map((s) => ({
      id: s.id,
      label: s.cnpj ? `${s.name} · ${s.cnpj}` : s.name
    }))
  });
}
