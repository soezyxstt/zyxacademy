import React, { lazy, Suspense } from 'react';
export default function dynamic(loader: any, options: any = {}) {
  const Component = lazy(loader);
  return function Dynamic(props: any) { return <Suspense fallback={options.loading ? <options.loading /> : null}><Component {...props} /></Suspense>; };
}
