import { useEffect, useRef, useState, type ComponentRef, type RefObject } from "react";
import { Linking, ScrollView, StyleSheet, useColorScheme, View } from "react-native";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { publicExternalUrl, resolvePublicRoute, type PublicRoute } from "../../../../../packages/native-parity/operations/public-contract";
import { stripPublicLocalePrefix } from "../../../../../lib/public-locale-routes";
import id from "../../../../../messages/id/marketing.json";
import en from "../../../../../messages/en/marketing.json";
import { BlogArticle, BlogList } from "./blog";
import { About, Landing, Legal, Testimonial } from "./content";
import { Demo, Download, Unsubscribe } from "./dynamic";
import { FormsPlayground } from "./forms";
import { Plans } from "./plans";
import { Action, Divider, Label, layout, PublicContext, type PublicScreenProps, StatePanel } from "./ui";

export type { PublicArticleRenderer, PublicFile, PublicScreenProps } from "./ui";
export { createPublicClient, resolvePublicRoute } from "../../../../../packages/native-parity/operations/public-contract";

function RouteContent({ route, scroller }: { route: PublicRoute | null; scroller: RefObject<ComponentRef<typeof ScrollView> | null> }) {
  if (!route) return <StatePanel kind="empty" />;
  switch (route.kind) {
    case "blog": return <BlogList category={route.category} page={route.page} />;
    case "article": return <BlogArticle slug={route.slug} />;
    case "demo": return <Demo route={route} />;
    case "unsubscribe": return <Unsubscribe route={route} />;
    case "missing": return <StatePanel kind="empty" />;
    case "static": switch (route.path) {
      case "/": return <Landing />;
      case "/about": return <About />;
      case "/download": return <Download />;
      case "/plans": return <Plans />;
      case "/privacy": return <Legal document="privacy" scroller={scroller} />;
      case "/terms": return <Legal document="terms" scroller={scroller} />;
      case "/testimonial": return <Testimonial />;
      case "/forms-playground": return <FormsPlayground />;
    }
  }
}

export function PublicScreen(props: PublicScreenProps) {
  const scheme = useColorScheme();
  const theme = props.theme ?? scheme ?? "light";
  const colors = nativeColors[theme];
  const copy = props.locale === "id" ? id : en;
  const [menu, setMenu] = useState(false);
  const [failedLink, setFailedLink] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const basePath = props.href.split(/[?#]/, 1)[0];
  const stripped = stripPublicLocalePrefix(basePath);
  const href = stripped ? stripped.path + props.href.slice(basePath.length) : props.href;
  const route = resolvePublicRoute(href);

  useEffect(() => {
    setMenu(false);
    setFailedLink(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [href]);

  function openExternal(value: string) {
    setFailedLink(false);
    void Promise.resolve().then(() => {
      const target = publicExternalUrl(value, props.origin, props.locale);
      return props.onOpenExternal ? props.onOpenExternal(target) : Linking.openURL(target);
    }).catch(() => setFailedLink(true));
  }

  const menuItems = [
    ["/plans", copy.nav.plans], ["/about", copy.nav.about], ["/testimonial", copy.nav.testimonials],
    ["/blog", copy.nav.blog], ["/download", copy.nav.download],
  ] as const;

  return <PublicContext.Provider value={{ ...props, href, theme, colors, copy, openExternal }}>
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.navbar, { borderColor: colors.border }]}>
        <Action href="/" variant="ghost" accessibilityLabel={copy.nav.homeBrand}>Zyx Academy</Action>
        <Action onPress={() => setMenu(!menu)} variant="outline" id="public-menu">{menu ? copy.nav.closeMenu : copy.nav.openMenu}</Action>
      </View>
      {menu && <View style={[styles.menu, { borderColor: colors.border }]} accessibilityLabel={copy.nav.mobileMenu}>
        {menuItems.map(([path, title]) => <Action key={path} href={path} variant={(stripped?.path ?? basePath) === path ? "default" : "ghost"}>{title}</Action>)}
        <Action href="/sign-in" variant="default">{copy.nav.signIn}</Action>
      </View>}
      {failedLink && <View style={styles.linkError}><Label tone="error" live="assertive">{props.locale === "id" ? "Tautan tidak dapat dibuka." : "Unable to open link."}</Label></View>}
      <ScrollView ref={scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <RouteContent route={route} scroller={scroll} key={href} />
        <View style={styles.footer}>
          <Divider />
          <View style={layout.row}>
            <Action href="/privacy" variant="link">{copy.footer.privacy}</Action>
            <Action href="/terms" variant="link">{copy.footer.terms}</Action>
            <Action href="/blog" variant="link">{copy.nav.blog}</Action>
          </View>
        </View>
      </ScrollView>
    </View>
  </PublicContext.Provider>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  navbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  menu: { alignItems: "flex-start", borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingBottom: 8 },
  body: { maxWidth: 960, width: "100%", alignSelf: "center", paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32, gap: 32 },
  footer: { gap: 8 },
  linkError: { padding: 12 },
});
