import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { OPS_AI_CITATION_OFFICIAL_LABEL, type OpsAiCitation } from "../../../../../lib/admin-ops-ai/chat-contract";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { nativeTypography } from "../../../typography";
import { NavigationIcon } from "../../shared-ui/navigation-icons";

const labels = {
  id: {
    sources: OPS_AI_CITATION_OFFICIAL_LABEL,
    sourceTypes: { "semantic-rag": "Basis pengetahuan", "database-read": "Basis data", "live-tool": "Navigasi", "system-context": "Dokumentasi" },
    expand: "Lihat kutipan lengkap", collapse: "Perkecil kutipan", open: "Buka halaman",
  },
  en: {
    sources: "Sources provided to the model",
    sourceTypes: { "semantic-rag": "Knowledge base", "database-read": "Database", "live-tool": "Navigation", "system-context": "Documentation" },
    expand: "Show full excerpt", collapse: "Collapse excerpt", open: "Open page",
  },
};

export function OpsAiSources({ citations, theme, locale, disabled, resolveDestination, onVisit }: {
  citations: OpsAiCitation[];
  theme: keyof typeof nativeColors;
  locale: "id" | "en";
  disabled: boolean;
  resolveDestination(citation: OpsAiCitation): string | null;
  onVisit(target: string): void;
}) {
  const t = labels[locale];
  const colors = nativeColors[theme];
  const { canInteract } = useProtectedInteraction();
  const [expanded, setExpanded] = useState(false);
  const [snippets, setSnippets] = useState<Record<string, boolean>>({});
  const muted = [styles.small, { color: colors.mutedForeground }];

  return <View style={styles.stack}>
    <Button theme={theme} variant="ghost" style={styles.button} accessibilityState={{ expanded }}
      renderIcon={(color, size) => <NavigationIcon name={expanded ? "chevron" : "chevron-right"} color={color} size={size} />}
      onPress={() => { if (canInteract()) setExpanded(!expanded); }}>{`${t.sources} (${citations.length})`}</Button>
    {expanded && citations.map(citation => {
      const snippetOpen = snippets[citation.id] === true;
      const destination = resolveDestination(citation);
      const metadata = [t.sourceTypes[citation.source], citation.filePath, citation.section,
        typeof citation.score === "number" ? `${Math.round(citation.score * 100)}%` : undefined].filter(Boolean).join(" · ");
      return <View key={citation.id} style={[styles.source, { borderStartColor: colors.border }]}>
        <Text style={[nativeTypography.bodySemibold, { color: colors.foreground }]}>{citation.title}</Text>
        <Text style={muted}>{metadata}</Text>
        <Text selectable numberOfLines={!snippetOpen && citation.snippet.length > 120 ? 2 : undefined} style={muted}>
          {citation.snippet}
        </Text>
        {citation.snippet.length > 120 && <Button theme={theme} variant="link" style={styles.button}
          accessibilityState={{ expanded: snippetOpen }}
          onPress={() => { if (canInteract()) setSnippets(previous => ({ ...previous, [citation.id]: !snippetOpen })); }}>
          {snippetOpen ? t.collapse : t.expand}
        </Button>}
        {destination && <Button theme={theme} variant="link" style={styles.button} disabled={disabled}
          accessibilityRole="link" accessibilityLabel={`${t.open}, ${citation.title}`}
          renderIcon={(color, size) => <NavigationIcon name="arrow-up-right" color={color} size={size} />}
          onPress={() => onVisit(destination)}>{t.open}</Button>}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  button: { alignSelf: "flex-start" },
  small: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 18 },
  source: { gap: 4, paddingStart: 10, borderStartWidth: StyleSheet.hairlineWidth },
});
