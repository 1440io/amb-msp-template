import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/amb/AppShell";
import { AssetLibrary } from "@/components/amb/AssetLibrary";

export const Route = createFileRoute("/_authenticated/assets")({
  head: () => ({
    meta: [
      { title: "Image assets — AMB Agent Console" },
      {
        name: "description",
        content:
          "Upload, import, or AI-generate the images that Apple Messages for Business templates bind to.",
      },
      { property: "og:title", content: "Image assets — AMB Agent Console" },
      {
        property: "og:description",
        content: "Manage the rich-asset library behind your Apple Messages for Business templates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssetsPage,
});

function AssetsPage() {
  return (
    <AppShell>
      <div className="h-full overflow-y-auto px-6 py-6">
        <div className="max-w-5xl">
          <h1 className="text-base font-semibold text-foreground">Image assets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Artwork lives here and is bound to a template's image slot. Upload a file, import an
            image URL, or describe the image and let AI create it.
          </p>
          <div className="mt-5">
            <AssetLibrary />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
