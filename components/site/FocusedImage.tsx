import Image, { type ImageProps } from "next/image";

import { getAssetManifestEntryByPath } from "@/content/asset-manifest";

type FocusedImageProps = Omit<ImageProps, "src"> & {
  readonly src: string;
};

/**
 * Renders an approved local concept asset using its audited safe focal point.
 * Explicit caller styles still win for properties other than object-position.
 */
export function FocusedImage({ src, style, alt, ...props }: FocusedImageProps) {
  const asset = getAssetManifestEntryByPath(src);

  return (
    <Image
      {...props}
      src={src}
      alt={alt}
      style={{
        ...style,
        ...(asset
          ? { objectPosition: `${asset.focus.x * 100}% ${asset.focus.y * 100}%` }
          : {}),
      }}
    />
  );
}
