import type { ReactNode } from "react";
import { Text, View } from "react-native";
import {
  DISCUSSION_HEADING_LINE, DISCUSSION_INLINE_PATTERN, safeDiscussionLink,
} from "../../../../../packages/student-community/discussion-markdown";
import type { DiscussionMessage } from "../../../../../lib/discussions/contracts";
import { matchStudentRoute } from "../routes";
import { Copy, styles, useCommunity } from "./ui";

type Person = NonNullable<DiscussionMessage["mentionedPeople"]>[number];

export function DiscussionMessageBody({ content, people, onPerson }: {
  content: string; people?: readonly Person[]; onPerson(id: string): void;
}) {
  const { colors, navigate, openExternal } = useCommunity();
  const linkStyle = { textDecorationLine: "underline", color: colors.primary } as const;
  const codeStyle = { fontFamily: "monospace" } as const;
  const peopleByMention = new Map(people?.map(person => [person.mention?.toLowerCase(), person]));

  function renderInline(body: string, depth = 0): ReactNode[] {
    if (depth >= 4) return [body];
    const nodes: ReactNode[] = [];
    let offset = 0;
    for (const match of body.matchAll(DISCUSSION_INLINE_PATTERN)) {
      const index = match.index;
      if (index > offset) nodes.push(body.slice(offset, index));
      if (match[1] !== undefined) nodes.push(match[1]);
      else if (match[2] !== undefined) {
        const href = safeDiscussionLink(match[3]);
        const target = href && matchStudentRoute(href);
        const open = target ? () => navigate(target.path) : href && openExternal ? () => openExternal(href) : undefined;
        nodes.push(open ? <Text key={index} accessibilityRole="link" style={linkStyle} onPress={open}>{match[2]}</Text> : match[2]);
      } else if (match[4] !== undefined) {
        nodes.push(<Text key={index} style={{ fontWeight: "700" }}>{renderInline(match[4], depth + 1)}</Text>);
      } else if (match[5] !== undefined) {
        nodes.push(<Text key={index} style={{ fontStyle: "italic" }}>{renderInline(match[5], depth + 1)}</Text>);
      } else if (match[6] !== undefined || match[7] !== undefined || match[8] !== undefined) {
        nodes.push(<Text key={index} style={codeStyle}>{match[6] ?? match[0]}</Text>);
      } else if (match[9]) {
        const person = peopleByMention.get(match[9].toLowerCase());
        nodes.push(person ? <Text key={index} accessibilityRole="link" style={linkStyle}
          onPress={() => onPerson(person.id)}>@{person.name}</Text> : match[0]);
      }
      offset = index + match[0].length;
    }
    if (offset < body.length) nodes.push(body.slice(offset));
    return nodes;
  }

  if (content.length > 20_000) return <Copy>{content}</Copy>;
  return <View style={styles.field}>
    {content.split(/(```[\s\S]*?```|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g).map((part, block) => {
      if (part.startsWith("```") && part.endsWith("```")) return <Copy key={block}><Text style={codeStyle}>{part.slice(3, -3).replace(/^\w*\n/, "")}</Text></Copy>;
      if ((part.startsWith("$$") && part.endsWith("$$")) || (part.startsWith("\\[") && part.endsWith("\\]"))) {
        return <Copy key={block}><Text style={codeStyle}>{part}</Text></Copy>;
      }
      const prose = part.trim();
      if (!prose) return null;
      return <Copy key={block}>{prose.split("\n").map((line, index) => {
        const heading = DISCUSSION_HEADING_LINE.exec(line);
        return <Text key={index} style={heading ? { fontWeight: "700" } : undefined}>
          {index > 0 && "\n"}{renderInline((heading?.[1] ?? line).replace(/^\s*[-*] /, "• "))}
        </Text>;
      })}</Copy>;
    })}
  </View>;
}
