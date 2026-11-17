import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const galleryImageSchema = z.object({
  /** Absolute local path on the daemon machine, or an http(s) URL. */
  src: z.string(),
  kind: z.enum(["file", "url"]),
  /** Where the image was found in the timeline, e.g. "Read", "user upload", "markdown". */
  source: z.string(),
  /** Timestamp of the timeline entry where the image first appeared. */
  timestamp: z.string(),
  agentId: z.string(),
  agentTitle: z.string(),
});

export type GalleryImage = z.output<typeof galleryImageSchema>;

export const listImagesRpc = defineRpc({
  name: "gallery.list",
  input: z.object({ workspaceId: z.string() }),
  output: z.object({ images: z.array(galleryImageSchema) }),
});

export const readImageRpc = defineRpc({
  name: "gallery.read",
  input: z.object({ path: z.string() }),
  output: z.object({ mimeType: z.string(), base64: z.string() }),
});

