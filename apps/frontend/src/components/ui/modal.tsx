"use client";

import { PropsWithChildren } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ModalProps = PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Largura máxima do painel (ex.: formulários largos). */
  contentClassName?: string;
}>;

/**
 * Modal acessível (Radix Dialog) com transição leve (Framer Motion).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  contentClassName,
  children
}: ModalProps): JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "flex max-h-[min(92dvh,880px)] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:rounded-lg",
          contentClassName
        )}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 text-left">
            <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
            {description ? <DialogDescription className="text-sm">{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
