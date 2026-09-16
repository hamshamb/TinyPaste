import Image from 'next/image';
import { cn } from '@/lib/utils/cn';

const SOURCE_WIDTH = 512;
const SOURCE_HEIGHT = 341;

/**
 * The supplied Affinity previews include an opaque white artboard around the
 * page-shaped mark. The clip follows that page silhouette, while the oversized
 * source image is positioned so the clipped artwork fills this compact header
 * slot without modifying or regenerating the original logo.
 */
const LOGO_CLIP = 'polygon(28.5% 12%, 51.5% 12%, 67.8% 45%, 67.8% 88%, 28.5% 88%)';

function LogoAsset({ src, className }: { src: string; className: string }) {
  return (
    <Image
      src={src}
      alt=""
      width={SOURCE_WIDTH}
      height={SOURCE_HEIGHT}
      draggable={false}
      className={cn('absolute max-w-none select-none', className)}
      style={{
        width: 62,
        height: 'auto',
        left: -18,
        top: -5,
        clipPath: LOGO_CLIP,
      }}
    />
  );
}

/**
 * Theme-aware TinyPaste mark.
 *
 * The dark artwork is used against the light UI; the light/purple artwork is
 * used against the dark UI. Theme selection follows the app's `.dark` class,
 * so an explicit preference wins over the operating-system preference.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('relative block h-8 w-6 shrink-0 overflow-hidden', className)}
    >
      <LogoAsset src="/brand/tinypaste-logo-dark.png" className="block dark:hidden" />
      <LogoAsset src="/brand/tinypaste-logo-light.png" className="hidden dark:block" />
    </span>
  );
}
