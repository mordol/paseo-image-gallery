import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listImages, readImage } from "./server/gallery";
import { listImagesRpc, readImageRpc } from "./shared/gallery";

export default function contribute(server: PluginServerContext) {
  server.handle(listImagesRpc, listImages);
  server.handle(readImageRpc, readImage);
  return () => {};
}
