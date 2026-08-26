import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AMB Agent Console — Apple Messages for Business inbox" },
      {
        name: "description",
        content:
          "A live agent inbox for Apple Messages for Business: real-time threads, rich templates with readiness checks, and signed webhook delivery.",
      },
      { property: "og:title", content: "AMB Agent Console" },
      {
        property: "og:description",
        content: "Live agent inbox for Apple Messages for Business, powered by 1440's MSP API.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/inbox", replace: true });
    });
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">AMB Agent Console</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          A live agent inbox for Apple Messages for Business. Threads update in real time, rich
          templates are checked for channel readiness before you can send, and every 1440 credential
          stays server-side.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Button asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
          <Link
            to="/setup"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Setup checklist
          </Link>
        </div>
      </div>
    </main>
  );
}
