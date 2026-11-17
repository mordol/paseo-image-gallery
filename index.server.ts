import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listImages, readImage, readThumbnail } from "./server/gallery";
import { listImagesRpc, readImageRpc, readThumbnailRpc } from "./shared/gallery";

export default function contribute(server: PluginServerContext) {
  server.handle(listImagesRpc, listImages);
  server.handle(readImageRpc, readImage);
  server.handle(readThumbnailRpc, readThumbnail);
  return () => {};
}
