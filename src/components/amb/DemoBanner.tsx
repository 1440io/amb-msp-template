import { Link } from "@tanstack/react-router";

export function DemoBanner() {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-accent px-4 py-1.5 text-xs text-accent-foreground">
      <span className="font-medium">Demo data</span>
      <span className="text-accent-foreground/80">
        No 1440 credentials configured yet — these conversations are samples.
      </span>
      <Link to="/setup" className="ml-auto underline underline-offset-2">
        Finish setup
      </Link>
    </div>
  );
}
