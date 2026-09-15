'use client';

import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * QR rendered locally as an SVG.
 *
 * Deliberately not a hosted QR image service: for an encrypted paste the share
 * URL contains the decryption key, and sending it to a third party would hand
 * over the very secret the feature exists to protect.
 */
export function QrCode({ value, size = 168 }: { value: string; size?: number }) {
  const path = useMemo(() => {
    // Type 0 = auto-select the smallest version that fits; 'L' keeps the module
    // count low for long encrypted URLs.
    const qr = qrcode(0, 'L');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (qr.isDark(row, column)) d += `M${column} ${row}h1v1h-1z`;
      }
    }
    return { d, count };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label="QR code for this paste link"
      width={size}
      height={size}
      viewBox={`0 0 ${path.count} ${path.count}`}
      shapeRendering="crispEdges"
      className="rounded-md bg-white p-1"
    >
      <path d={path.d} fill="#000" />
    </svg>
  );
}
