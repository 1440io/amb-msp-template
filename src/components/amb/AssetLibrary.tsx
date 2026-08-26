// The /assets page body: every image in the rich-asset library, with add and
// delete. Deletes are refused by the API while a template still binds the image.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { deleteAsset } from "@/lib/assets.functions";
import { assetUsageLabel, ASSET_USAGES, type AssetUsage } from "@/lib/asset-client";
import { AssetDialog, useAssetLibrary } from "@/components/amb/AssetDialog";
import { AssetThumb } from "@/components/amb/AssetThumb";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function formatSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssetLibrary() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useAssetLibrary();
  const [dialogUsage, setDialogUsage] = useState<AssetUsage | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const remove = useServerFn(deleteAsset);
  const removal = useMutation({
    mutationFn: async (assetId: string) => remove({ data: { assetId } }),
    onSuccess: (result) => {
      setPendingDelete(null);
      if (!result.ok) {
        toast.error(result.error ?? "Delete failed");
        return;
      }
      toast.success("Image deleted");
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (error) => {
      setPendingDelete(null);
      toast.error(error instanceof Error ? error.message : "Delete failed");
    },
  });

  const assets = data?.assets ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {ASSET_USAGES.map((usage) => (
          <Button key={usage} size="sm" variant="secondary" onClick={() => setDialogUsage(usage)}>
            Add {assetUsageLabel(usage).toLowerCase()}
          </Button>
        ))}
      </div>

      {data?.error ? <p className="text-[11px] text-destructive">{data.error}</p> : null}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading the library…</p>
      ) : assets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No images yet. Add one above, then bind it to an image slot in a template.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <div key={asset.id} className="flex gap-3 rounded-lg border border-border bg-card p-3">
              <AssetThumb assetId={asset.id} displayName={asset.displayName} className="h-16 w-24" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{asset.displayName}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {assetUsageLabel(asset.usage)}
                  {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
                  {asset.sizeBytes ? ` · ${formatSize(asset.sizeBytes)}` : ""}
                </p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                  {asset.id}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                  onClick={() => setPendingDelete(asset.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialogUsage ? (
        <AssetDialog
          open
          usage={dialogUsage}
          showLibrary={false}
          onOpenChange={(open) => (open ? undefined : setDialogUsage(null))}
          onSelected={() => setDialogUsage(null)}
        />
      ) : null}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => (open ? undefined : setPendingDelete(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this image?</AlertDialogTitle>
            <AlertDialogDescription>
              Templates that still bind it will keep the binding and the delete will be refused.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) removal.mutate(pendingDelete);
              }}
            >
              {removal.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
