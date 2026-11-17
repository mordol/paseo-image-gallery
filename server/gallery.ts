import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { GalleryImage, listImagesRpc, readImageRpc } from "../shared/gallery";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};
const EXT = "png|jpe?g|gif|webp|bmp|svg";
const PAGE_SIZE = 500;
const MAX_BYTES = 25 * 1024 * 1024;

/** Absolute or ~-prefixed paths, stopping at whitespace, quotes, and markdown/JSON delimiters. */
const PATH_PATTERN = new RegExp(String.raw`(?:~|/)[^\s"'\`<>()\[\]{},;|*]*\.(?:${EXT})\b`, "gi");
const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const URL_PATTERN = new RegExp(String.raw`https?://[^\s"'\`<>()\[\]]+?\.(?:${EXT})(?:\?[^\s"'\`<>()\[\]]*)?(?=[\s"'\`<>()\[\]]|$)`, "gi");

/** Paths a scan returned; `gallery.read` serves only these. */
const allowedPaths = new Set<string>();

interface Candidate {
  raw: string;
  source: string;
}

function textCandidates(text: string, source: string): Candidate[] {
  const found: Candidate[] = [];
  for (const match of text.matchAll(MARKDOWN_IMAGE)) found.push({ raw: match[1], source: "markdown" });
  for (const match of text.matchAll(URL_PATTERN)) found.push({ raw: match[0], source });
  for (const match of text.matchAll(PATH_PATTERN)) found.push({ raw: match[0], source });
  return found;
}

function collect(value: unknown, source: string, out: Candidate[]): void {
  if (typeof value === "string") {
    out.push(...textCandidates(value, source));
  } else if (Array.isArray(value)) {
    for (const entry of value) collect(entry, source, out);
  } else if (value && typeof value === "object") {
    // Skip inline base64 payloads; they are never paths and can be huge.
    for (const [key, entry] of Object.entries(value)) if (key !== "data") collect(entry, source, out);
  }
}

// The timeline item type lives in @getpaseo/protocol; match its shape loosely here.
type TimelineItem = { type: string; [key: string]: unknown };

function itemCandidates(item: TimelineItem): Candidate[] {
  const out: Candidate[] = [];
  switch (item.type) {
    case "user_message":
      collect(item.text, "user message", out);
      break;
    case "assistant_message":
      collect(item.text, "assistant", out);
      break;
    case "tool_call": {
      const name = String(item.name ?? "tool");
      const detail = item.detail as { type: string; filePath?: string } | undefined;
      if (detail?.filePath && new RegExp(String.raw`\.(?:${EXT})$`, "i").test(detail.filePath)) {
        out.push({ raw: detail.filePath, source: name });
      }
      collect(detail, name, out);
      break;
    }
    default:
      break;
  }
  return out;
}

/** Content hash of a readable image file, or null when it is missing or too large. */
async function fileHash(path: string): Promise<string | null> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_BYTES) return null;
    return createHash("sha1").update(await readFile(path)).digest("hex");
  } catch {
    return null;
  }
}

function normalize(raw: string, cwd: string, home: string): Pick<GalleryImage, "src" | "kind"> | null {
  const trimmed = raw.replace(/[.:]+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return { src: trimmed, kind: "url" };
  if (/^file:\/\//i.test(trimmed)) {
    try {
      return { src: fileURLToPath(trimmed), kind: "file" };
    } catch {
      return null;
    }
  }
  if (/^[a-z]+:/i.test(trimmed)) return null; // data: and other schemes
  if (trimmed.startsWith("~/")) return { src: resolve(home, trimmed.slice(2)), kind: "file" };
  return { src: isAbsolute(trimmed) ? resolve(trimmed) : resolve(cwd, trimmed), kind: "file" };
}

interface WorkspaceAgent {
  id: string;
  title: string;
}

async function workspaceAgents(paseo: PluginHandlerContext["paseo"], workspaceId: string) {
  const { entries } = await paseo.agents.list({ page: { limit: 200 } });
  return entries
    .map((entry) => entry.agent)
    .filter((agent) => agent.workspaceId === workspaceId && !agent.archivedAt && !agent.background)
    .map((agent): WorkspaceAgent => ({ id: agent.id, title: agent.title ?? agent.id.slice(0, 7) }));
}

/** Every image reference in one agent's timeline, first occurrence per path, unchecked on disk. */
async function agentCandidates(paseo: PluginHandlerContext["paseo"], agent: WorkspaceAgent) {
  const timeline = paseo.agents.ref(agent.id).timeline;
  const pages = [];
  let page = await timeline.refetch({ direction: "tail", limit: PAGE_SIZE, projection: "canonical" });
  pages.unshift(page);
  while (page.hasOlder && page.startCursor) {
    page = await timeline.refetch({
      direction: "before",
      cursor: page.startCursor,
      limit: PAGE_SIZE,
      projection: "canonical",
    });
    pages.unshift(page);
  }

  const cwd = pages.at(-1)?.agent?.cwd ?? process.cwd();
  const home = process.env.HOME ?? "/";
  const seen = new Map<string, GalleryImage>();
  for (const { entries } of pages) {
    for (const entry of entries) {
      for (const candidate of itemCandidates(entry.item as TimelineItem)) {
        const normalized = normalize(candidate.raw, cwd, home);
        if (!normalized || seen.has(normalized.src)) continue;
        seen.set(normalized.src, {
          ...normalized,
          source: candidate.source,
          timestamp: entry.timestamp,
          agentId: agent.id,
          agentTitle: agent.title,
        });
      }
    }
  }
  return [...seen.values()];
}

export async function listImages(
  { workspaceId }: RpcInput<typeof listImagesRpc>,
  { paseo }: PluginHandlerContext,
): Promise<{ images: GalleryImage[] }> {
  const agents = await workspaceAgents(paseo, workspaceId);
  const perAgent = await Promise.all(
    agents.map((agent) =>
      agentCandidates(paseo, agent).catch((error) => {
        console.error(`Skipping agent ${agent.id}:`, error);
        return [];
      }),
    ),
  );
  const candidates = perAgent.flat().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const hashes = await Promise.all(
    candidates.map((image) => (image.kind === "url" ? image.src : fileHash(image.src))),
  );
  // The same image can appear under several paths and agents (Paseo also copies images an
  // agent viewed into paseo-attachments); keep only its earliest appearance.
  const seenHashes = new Set<string>();
  const images = candidates.filter((_, index) => {
    const hash = hashes[index];
    if (hash === null || seenHashes.has(hash)) return false;
    seenHashes.add(hash);
    return true;
  });
  for (const image of images) if (image.kind === "file") allowedPaths.add(image.src);
  return { images };
}

export async function readImage({ path }: RpcInput<typeof readImageRpc>) {
  if (!allowedPaths.has(path)) {
    throw new Error("This path is not an image from a session. Refresh the gallery.");
  }
  const mimeType = MIME_TYPES[extname(path).toLowerCase()];
  if (!mimeType) throw new Error(`Unsupported image type: ${path}`);
  const bytes = await readFile(path);
  return { mimeType, base64: bytes.toString("base64") };
}
