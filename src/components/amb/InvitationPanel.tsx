import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listInitiations, sendInitiation } from "@/lib/msp.functions";
import { channelLabel, relativeTime } from "@/lib/amb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JsonDebugPanel, type DebugEntry } from "@/components/amb/JsonDebugPanel";

type InitiationListRow = {
  id: string;
  channel: string;
  status: string;
  reasonCode: string | null;
  phoneMasked: string | null;
  firstName: string | null;
  lastName: string | null;
  targetAgentStatus: string | null;
  conversationId: string | null;
  isDemo: boolean;
  createdAt: string;
};

const STATUS_TONE: Record<string, string> = {
  accepted: "text-primary",
  declined: "text-destructive",
  provider_rejected: "text-destructive",
  error: "text-destructive",
  submitting: "text-muted-foreground",
  submitted: "text-muted-foreground",
};

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function targetLabel(row: InitiationListRow) {
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  return name || row.phoneMasked || "Unnamed customer";
}

/**
 * Business-initiated conversations ("invitation messages"). The phone number is
 * sent to 1440 at request time only — we store the masked form.
 */
export function InvitationPanel() {
  const queryClient = useQueryClient();
  const send = useServerFn(sendInitiation);
  const load = useServerFn(listInitiations);

  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [channel, setChannel] = useState("amb");
  const [agentStatus, setAgentStatus] = useState("live");
  const [sending, setSending] = useState(false);
  const [debug, setDebug] = useState<DebugEntry | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["initiations"],
    queryFn: async () => (await load()).initiations as InitiationListRow[],
  });
  const initiations = data ?? [];

  useEffect(() => {
    const sub = supabase
      .channel("initiations-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "initiations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["initiations"] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [queryClient]);

  async function submit() {
    setSending(true);
    setDebug(null);
    try {
      const result = await send({
        data: {
          phoneNumber: phone,
          channel,
          firstName,
          lastName,
          targetAgentStatus: agentStatus,
        },
      });
      setDebug({
        label: result.ok ? "Invitation submitted" : `Invitation failed · ${result.status || "local"}`,
        detail: result.debug,
      });
      setDebugOpen(!result.ok);
      if (result.ok) {
        toast.success("Invitation sent — waiting for the customer to accept.");
        setPhone("");
        setFirstName("");
        setLastName("");
        queryClient.invalidateQueries({ queryKey: ["initiations"] });
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invitation failed";
      setDebug({ label: "Invitation failed", detail: { message } });
      setDebugOpen(true);
      toast.error(message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-full text-xs">
          New invitation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite a customer</DialogTitle>
          <DialogDescription>
            Start a business-initiated conversation. The customer receives an invitation and the
            thread appears in your inbox once they accept.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="invite-phone" className="text-xs">
              Phone number (E.164)
            </Label>
            <Input
              id="invite-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+13035551234"
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-first" className="text-xs">
                First name (optional)
              </Label>
              <Input
                id="invite-first"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-last" className="text-xs">
                Last name (optional)
              </Label>
              <Input
                id="invite-last"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Starts with</Label>
            <Select value={agentStatus} onValueChange={setAgentStatus}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="live">Live agent</SelectItem>
                <SelectItem value="bot">Bot</SelectItem>
              </SelectContent>
            </Select>
          </div>


          <Button size="sm" className="w-full" disabled={sending} onClick={() => void submit()}>
            {sending ? "Sending…" : "Send invitation"}
          </Button>

          <JsonDebugPanel
            entry={debug}
            open={debugOpen}
            onToggle={() => setDebugOpen((value) => !value)}
          />
        </div>

        <div className="mt-2 border-t border-border pt-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Recent invitations
          </p>
          {initiations.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No invitations yet. Send one above to start a conversation.
            </p>
          ) : (
            <ul className="max-h-56 space-y-1.5 overflow-y-auto">
              {initiations.map((row) => (
                <li
                  key={row.id}
                  className="rounded-md border border-border px-2.5 py-2 text-xs"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-medium text-foreground">{targetLabel(row)}</span>
                    <span
                      className={`ml-auto shrink-0 text-[10px] uppercase tracking-wide ${
                        STATUS_TONE[row.status] ?? "text-muted-foreground"
                      }`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{channelLabel(row.channel)}</span>
                    {row.phoneMasked ? <span>{row.phoneMasked}</span> : null}
                    <span>{relativeTime(row.createdAt)}</span>
                    {row.isDemo ? <span>Demo</span> : null}
                  </div>
                  {row.reasonCode ? (
                    <p className="mt-1 text-[10px] text-destructive">{row.reasonCode}</p>
                  ) : null}
                  {row.conversationId ? (
                    <Link
                      to="/inbox/$conversationId"
                      params={{ conversationId: row.conversationId }}
                      onClick={() => setOpen(false)}
                      className="mt-1 inline-block text-[10px] text-primary hover:underline"
                    >
                      Open conversation →
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
