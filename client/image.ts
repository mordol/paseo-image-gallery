import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { type GalleryImage, readImageRpc } from "../shared/gallery";

/** Resolves an image to a URI the Image component can show. Local files come from the daemon. */
export function useImageUri(image: GalleryImage) {
  const readImage = useRpc(readImageRpc);
  const query = useQuery({
    queryKey: ["gallery-image", image.src],
    queryFn: () => readImage({ path: image.src }),
    enabled: image.kind === "file",
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (image.kind === "url") return { uri: image.src, error: null, loading: false };
  return {
    uri: query.data ? `data:${query.data.mimeType};base64,${query.data.base64}` : null,
    error: query.error,
    loading: query.isPending,
  };
}

export function fileName(src: string) {
  return src.split(/[\\/]/).pop()?.split("?")[0] || src;
}
