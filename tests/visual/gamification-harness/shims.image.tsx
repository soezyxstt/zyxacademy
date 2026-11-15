import React from 'react';
export default function Image({ src, alt, width, height, fill, sizes, priority, quality, placeholder, blurDataURL, unoptimized, loader, ...props }: any) {
  const path = typeof src === 'string' ? src : src?.src;
  const mapped = window.location.protocol === 'file:' && path?.startsWith('/') ? `.${path}` : path;
  return <img src={mapped} alt={alt} width={width || (fill ? undefined : src?.width)} height={height || (fill ? undefined : src?.height)} {...props} style={{ ...(fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%' } : {}), ...props.style }} />;
}
