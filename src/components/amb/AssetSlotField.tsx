// Image slot control used inside the template wizard. Picking an image names the
// slot and records the slot -> asset binding in one action, so authors never type
// asset ids by hand.
import { createContext, useContext, useState } from "react";
import { AssetDialog } from "@/components/amb/AssetDialog";
import { AssetThumb } from "@/components/amb/AssetThumb";
import { Button } from "@/components/ui/button";
import type { AssetUsage } from "@/lib/asset-client";
import type { AssetView } from "@/lib/msp.server";

type SlotContextValue = {
  assets: AssetView[];
  assetIdForSlot: (slot: string) => string | null;
  bindSlot: (slot: string, assetId: string) => void;
  unbindSlot: (slot: string) => void;
};

export const AssetSlotContext = createContext<SlotContextValue | null>(null);

export function ImageSlotField({
  value,
  onChange,
  usage,
  defaultSlot,
  required = false,
}: {
  value: string;
  onChange: (slot: string) => void;
  usage: AssetUsage;
  defaultSlot: string;
  required?: boolean;
}) {
  const context = useContext(AssetSlotContext);
  const [open, setOpen] = useState(false);

  const assetId = value && context ? context.assetIdForSlot(value) : null;
  const asset = assetId ? context?.assets.find((entry) => entry.id === assetId) : undefined;

  function pick(selected: AssetView) {
    const slot = value.trim() || defaultSlot;
    onChange(slot);
    context?.bindSlot(slot, selected.id);
  }

  function clear() {
    if (value) context?.unbindSlot(value);
    onChange("");
  }

  return (
    <div className="flex items-center gap-2">
      {assetId ? (
        <AssetThumb assetId={assetId} displayName={asset?.displayName ?? value} className="h-10 w-14" />
      ) : null}
      <div className="min-w-0 flex-1">
        {assetId ? (
          <>
            <p className="truncate text-xs text-foreground">{asset?.displayName ?? "Bound image"}</p>
            <p className="truncate text-[10px] text-muted-foreground">slot: {value}</p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {required ? "An image is required here." : "No image."}
          </p>
        )}
      </div>
      <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setOpen(true)}>
        {assetId ? "Change" : "Add image"}
      </Button>
      {assetId ? (
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clear}>
          Remove
        </Button>
      ) : null}
      {open ? (
        <AssetDialog open usage={usage} onOpenChange={setOpen} onSelected={pick} />
      ) : null}
    </div>
  );
}
