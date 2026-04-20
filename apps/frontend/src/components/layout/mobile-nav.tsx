"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { MainNavItem } from "./main-nav-data";
import { MainNavLinks } from "./main-nav-links";

type Props = {
  items: MainNavItem[];
};

export function MobileNav({ items }: Props): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div className="shrink-0 md:hidden">
      <Button type="button" variant="outline" size="icon" aria-label="Abrir menu de navegação" onClick={() => setOpen(true)}>
        <Menu className="h-4 w-4" aria-hidden />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-[min(100%,20rem)] max-w-none flex-col p-0">
          <SheetHeader className="border-b border-border px-4 py-4 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">GTI</p>
            <SheetTitle className="mt-0.5 text-left text-[15px] font-semibold leading-tight tracking-tight text-foreground">
              Gestão contratual
            </SheetTitle>
            <SheetDescription className="sr-only">Menu principal da aplicação</SheetDescription>
          </SheetHeader>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3" aria-label="Navegação principal">
            <MainNavLinks items={items} onNavigate={() => setOpen(false)} />
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
