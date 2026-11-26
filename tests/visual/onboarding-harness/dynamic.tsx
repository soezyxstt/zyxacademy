import { lazy, Suspense, type ComponentType } from "react";

export default function dynamic<P extends object>(loader: () => Promise<ComponentType<P> | { default: ComponentType<P> }>, options: { loading?: ComponentType; ssr?: boolean } = {}) {
  const Component = lazy(async () => {
    const result = await loader();
    return { default: typeof result === "object" && "default" in result ? result.default : result as ComponentType<P> };
  });
  return function FixtureDynamic(props: P) {
    const Loading = options.loading;
    return <Suspense fallback={Loading ? <Loading /> : null}><Component {...props} /></Suspense>;
  };
}
