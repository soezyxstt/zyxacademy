import React from 'react';
export default function Link({ href, children, prefetch, replace, scroll, ...props }: any) {
  const target = typeof href === 'string' ? href : (href?.pathname || '#');
  return <a href={target} {...props}>{children}</a>;
}
