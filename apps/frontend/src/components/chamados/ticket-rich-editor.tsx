"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const ReactQuill = dynamic(async () => (await import("react-quill")).default, {
  ssr: false,
  loading: () => (
    <div className="ticket-quill-editor ticket-quill-editor--loading" aria-busy>
      A carregar editor…
    </div>
  )
});

type Props = {
  value: string;
  onChange: (html: string) => void;
  /** Altura mínima aproximada da área editável (CSS no chamados-glpi.css) */
  variant?: "description" | "followup";
  id?: string;
  "aria-label"?: string;
};

export function TicketRichEditor({ value, onChange, variant = "description", id, "aria-label": ariaLabel }: Props): JSX.Element {
  const modules = useMemo(
    () => ({
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        [{ align: [] }],
        ["link"],
        ["blockquote", "code-block"],
        ["clean"]
      ]
    }),
    []
  );

  const formats = useMemo(
    () => [
      "header",
      "bold",
      "italic",
      "underline",
      "strike",
      "list",
      "bullet",
      "align",
      "link",
      "blockquote",
      "code-block"
    ],
    []
  );

  const wrapClass =
    variant === "followup"
      ? "modal-field-rich modal-field-rich--followup ticket-quill-editor-wrap"
      : "modal-field-rich ticket-quill-editor-wrap";

  return (
    <div className={wrapClass} id={id}>
      <ReactQuill
        theme="snow"
        value={value || ""}
        onChange={onChange}
        modules={modules}
        formats={formats}
        className="ticket-quill-editor"
        aria-label={ariaLabel}
      />
    </div>
  );
}
