/*
 * next/image shim for the MQ Player desktop client.
 *
 * The single web usage (TrackCard.tsx:167) already passes `unoptimized`
 * with fixed width/height and loading="lazy" — a plain <img> is a 1:1
 * replacement. Remote artwork URLs are re-written to the SoundCloud
 * image-proxy at data-mapping time (same as web), so no Next image
 * optimization pipeline is expected.
 */
import type { ImgHTMLAttributes } from "react";

export type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & {
  src: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  loader?: never;
  quality?: never;
  priority?: boolean;
  placeholder?: never;
  unoptimized?: boolean;
  overrideSrc?: never;
  onLoadingComplete?: never;
  srcSet?: never;
  sizes?: never;
  style?: React.CSSProperties;
};

export default function Image({ src, width, height, priority, unoptimized, ...rest }: ImageProps) {
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img src={src} width={width} height={height} loading={priority ? "eager" : rest.loading ?? "lazy"} decoding="async" {...rest} />;
}
