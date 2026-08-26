// One dialog for everything image-related: pick from the library, upload a file,
// import a URL, or generate with AI. Every path returns a library asset.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listAssets } from "@/lib/msp.functions";
import { generateAsset, importAssetFromUrl } from "@/lib/assets.functions";
import type { AssetView } from "@/lib/msp.server";
import {
  ASSET_USAGES,
  assetPromptHint,
  assetUsageLabel,
  uploadAssetFile,
  type AssetUsage,
} from "@/lib/asset-client";
import { AssetThumb } from "@/components/amb/AssetThumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function useAssetLibrary() {
  const list = useServerFn(listAssets);
  return useQuery({ queryKey: ["assets"], queryFn: () => list() });
}

export function AssetDialog({
  open,
  onOpenChange,
  usage,
  showLibrary = true,
  onSelected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usage: AssetUsage;
  showLibrary?: boolean;
  onSelected: (asset: AssetView) => void;
}) {
  const queryClient = useQueryClient();
  const { data } = useAssetLibrary();
  const fileInput = useRef<HTMLInputElement>(null);

  const [slot, setSlot] = useState<AssetUsage>(usage);
  const [displayName, setDisplayName] = useState("");
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");

  const importUrl = useServerFn(importAssetFromUrl);
  const generate = useServerFn(generateAsset);

  function finish(asset: AssetView, message: string) {
    void queryClient.invalidateQueries({ queryKey: ["assets"] });
    toast.success(message);
    setDisplayName("");
    setUrl("");
    setPrompt("");
    onSelected(asset);
    onOpenChange(false);
  }

  const upload = useMutation({
    mutationFn: async (file: File) =>
      uploadAssetFile({
        file,
        displayName: displayName.trim() || file.name.replace(/\.[^.]+$/, ""),
        usage: slot,
      }),
    onSuccess: (asset) => finish(asset, "Image added to the library"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Upload failed"),
  });

  const fromUrl = useMutation({
    mutationFn: async () => importUrl({ data: { displayName: displayName.trim(), usage: slot, url } }),
    onSuccess: (result) =>
      result.ok && result.asset
        ? finish(result.asset, "Image imported")
        : toast.error(result.error ?? "Import failed"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Import failed"),
  });

  const ai = useMutation({
    mutationFn: async () =>
      generate({ data: { displayName: displayName.trim(), usage: slot, prompt } }),
    onSuccess: (result) =>
      result.ok && result.asset
        ? finish(result.asset, "Image generated and added")
        : toast.error(result.error ?? "Generation failed"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Generation failed"),
  });

  const busy = upload.isPending || fromUrl.isPending || ai.isPending;
  const library = (data?.assets ?? []).filter((asset) => asset.usage === usage);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Images</DialogTitle>
          <DialogDescription className="text-xs">
            {assetUsageLabel(usage)} · upload a file, import a URL, or generate one with AI.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={showLibrary && library.length > 0 ? "library" : "upload"}>
          <TabsList className="h-8">
            {showLibrary ? (
              <TabsTrigger value="library" className="text-xs">
                Library
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="upload" className="text-xs">
              Upload
            </TabsTrigger>
            <TabsTrigger value="url" className="text-xs">
              From URL
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs">
              Generate
            </TabsTrigger>
          </TabsList>

          {showLibrary ? (
            <TabsContent value="library" className="mt-3 space-y-2">
              {library.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No {assetUsageLabel(usage).toLowerCase()} yet — add one from the other tabs.
                </p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {library.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => {
                        onSelected(asset);
                        onOpenChange(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-md border border-border p-2 text-left transition-colors hover:bg-accent"
                    >
                      <AssetThumb assetId={asset.id} displayName={asset.displayName} />
                      <span className="min-w-0">
                        <span className="block truncate text-xs text-foreground">
                          {asset.displayName}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {asset.id}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
          ) : null}

          <div className="mt-3 grid gap-2">
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Display name in the library"
              className="h-8 text-xs"
            />
            <Select value={slot} onValueChange={(value) => setSlot(value as AssetUsage)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_USAGES.map((entry) => (
                  <SelectItem key={entry} value={entry} className="text-xs">
                    {assetUsageLabel(entry)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="upload" className="mt-3 space-y-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) upload.mutate(file);
              }}
            />
            <Button size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
              {upload.isPending ? "Uploading…" : "Choose an image"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              PNG preferred, under 3 MB. Apple renders PNG most reliably.
            </p>
          </TabsContent>

          <TabsContent value="url" className="mt-3 space-y-2">
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/hero.png"
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              disabled={busy || !url.trim() || !displayName.trim()}
              onClick={() => fromUrl.mutate()}
            >
              {fromUrl.isPending ? "Fetching…" : "Import image"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Link directly to the image file — the server downloads it and stores it in the library.
            </p>
          </TabsContent>

          <TabsContent value="ai" className="mt-3 space-y-2">
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={3}
              placeholder={assetPromptHint(slot)}
              className="text-xs"
            />
            <Button
              size="sm"
              disabled={busy || !prompt.trim() || !displayName.trim()}
              onClick={() => ai.mutate()}
            >
              {ai.isPending ? "Generating…" : "Generate with AI"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {assetPromptHint(slot)} Generation can take up to a minute.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
