"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { AppBrand } from "@/components/brand/app-brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { MainNavGroup } from "./main-nav-data";
import { MainNavAccordion } from "./main-nav-accordion";

type Props = {
  groups: MainNavGroup[];
};

export function MobileNav({ groups }: Props): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div className="shrink-0 md:hidden">
      <Button type="button" variant="outline" size="icon" aria-label="Abrir menu de navegação" onClick={() => setOpen(true)}>
        <Menu className="h-4 w-4" aria-hidden />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-[min(100%,20rem)] max-w-none flex-col p-0">
          <SheetHeader className="border-b border-border bg-white px-4 py-4 text-left">
            <AppBrand variant="mobile" onNavigate={() => setOpen(false)} />
            <SheetTitle className="sr-only">Navegação</SheetTitle>
            <SheetDescription className="sr-only">Menu principal da aplicativo</SheetDescription>
          </SheetHeader>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3" aria-label="Navegação principal">
            <MainNavAccordion groups={groups} onNavigate={() => setOpen(false)} />
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
