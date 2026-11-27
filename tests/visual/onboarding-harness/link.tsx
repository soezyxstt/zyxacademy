import { forwardRef, type ComponentProps } from "react";
import { useRouter } from "./navigation";

type Props = Omit<ComponentProps<"a">, "href"> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  prefetch?: boolean | null;
  replace?: boolean;
  scroll?: boolean;
};

export default forwardRef<HTMLAnchorElement, Props>(function FixtureLink({ href, prefetch: _prefetch, replace, scroll: _scroll, onClick, ...props }, ref) {
  const router = useRouter();
  const resolved = typeof href === "string" ? href : `${href.pathname ?? "/"}${href.query ? `?${new URLSearchParams(href.query)}` : ""}`;
  return <a {...props} ref={ref} href={resolved} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === "_blank" || !resolved.startsWith("/")) return;
    event.preventDefault();
    router[replace ? "replace" : "push"](resolved);
  }} />;
});
