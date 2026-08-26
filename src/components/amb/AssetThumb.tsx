import { useEffect, useState } from "react";
import { fetchAssetObjectUrl } from "@/lib/asset-client";

/**
 * Thumbnail for a library asset. Falls back to initials when we have no cached
 * copy (assets uploaded outside this console have no readable URL).
 */
export function AssetThumb({
  assetId,
  displayName,
  className = "h-14 w-20",
}: {
  assetId: string;
  displayName: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;
    fetchAssetObjectUrl(assetId)
      .then((value) => {
        if (!active) {
          if (value) URL.revokeObjectURL(value);
          return;
        }
        objectUrl = value;
        setUrl(value);
      })
      .catch(() => setUrl(null));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/50 ${className}`}
    >
      {url ? (
        <img src={url} alt={displayName} className="h-full w-full object-cover" />
      ) : (
        <span className="px-1 text-center text-[10px] leading-tight text-muted-foreground">
          no preview
        </span>
      )}
    </div>
  );
}
