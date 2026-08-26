import { toast } from "sonner";

export type DebugEntry = { label: string; detail: unknown };

/** Collapsible, copyable diagnostics for AI drafts and platform responses. */
export function JsonDebugPanel({
  entry,
  open,
  onToggle,
}: {
  entry: DebugEntry | null;
  open: boolean;
  onToggle: () => void;
}) {
  if (!entry) return null;
  const text = JSON.stringify(entry.detail, null, 2);

  return (
    <div className="rounded-md border border-border bg-muted/30">
      <div className="flex items-center justify-between px-3 py-1.5">
        <button type="button" className="text-[11px] font-medium text-foreground" onClick={onToggle}>
          {open ? "▾" : "▸"} Debug · {entry.label}
        </button>
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => {
            void navigator.clipboard.writeText(text);
            toast.success("Debug detail copied");
          }}
        >
          Copy
        </button>
      </div>
      {open ? (
        <pre className="max-h-64 overflow-auto border-t border-border px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {text}
        </pre>
      ) : null}
    </div>
  );
}
