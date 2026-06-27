import styles from "./CaptureThumbnail.module.css";

// Source-capture thumbnail shown on rows / in the detail pane. Plain <img> (the
// blob URL is already optimized server-side); null src renders nothing.
export interface CaptureThumbnailProps {
  src: string | null | undefined;
  alt: string;
  size?: number;
}

export function CaptureThumbnail({ src, alt, size = 28 }: CaptureThumbnailProps) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={styles.thumb}
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
    />
  );
}
