/**
 * An `<img>` that may need turning, because it arrived sideways.
 *
 * Used by the gallery, the lightbox and the moderation grid, so all three agree
 * on how a rotated photograph is drawn — the alternative is three copies of the
 * wrapper markup that drift apart the first time one of them is adjusted.
 *
 * Rotation is CSS rather than a Cloudflare delivery option on purpose; the
 * reason is in cf-images.ts, and it is about EXIF rather than about layout.
 *
 * Unrotated is the overwhelming majority and renders as a bare <img> with no
 * wrapper at all, so nothing about the existing layout changes for it.
 */
export default function Rotatable({
  src,
  alt,
  rotation,
  width,
  height,
  className,
  loading,
  decoding,
}: {
  src: string;
  alt: string;
  rotation: number;
  /** Stored pixel size. A quarter turn needs them to swap the footprint. */
  width?: number | null;
  height?: number | null;
  className?: string;
  loading?: "lazy" | "eager";
  decoding?: "async" | "sync" | "auto";
}) {
  const quarter = rotation === 90 || rotation === 270;

  // A quarter turn without dimensions would have nothing to size the wrapper
  // against, and a wrong guess crops the picture. Better to show it the way it
  // arrived: `npm run dimensions` fills these in, and every approved photograph
  // has them today.
  const turn = quarter && width && height ? rotation : rotation === 180 ? 180 : 0;

  if (turn === 0) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} loading={loading} decoding={decoding} />;
  }

  return (
    <span
      className={`rot rot-${turn}`}
      style={
        turn === 180
          ? undefined
          : ({ "--w": String(width), "--h": String(height) } as React.CSSProperties)
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={className} loading={loading} decoding={decoding} />
    </span>
  );
}
