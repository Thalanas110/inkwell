import { createFileRoute } from "@tanstack/react-router";
import { Editor } from "@/components/Editor";

export const Route = createFileRoute("/editor/$id")({
  head: () => ({
    meta: [
      { title: "Fill & Sign — Inkwell" },
      {
        name: "description",
        content:
          "Fill form fields, place text and checkmarks, and stamp your signature on a PDF, fully offline.",
      },
      { property: "og:title", content: "Fill & Sign — Inkwell" },
      {
        property: "og:description",
        content: "Edit, fill and sign a PDF locally with Inkwell's offline editor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  ssr: false,
  component: EditorRoute,
});

function EditorRoute() {
  const { id } = Route.useParams();
  return <Editor docId={id} />;
}
