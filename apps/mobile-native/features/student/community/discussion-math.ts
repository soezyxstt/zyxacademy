import { DISCUSSION_HEADING_LINE, DISCUSSION_INLINE_PATTERN, safeDiscussionLink } from "../../../../../packages/student-community/discussion-markdown";

type Mention = { id: string; name: string; mention?: string | null };
type Target = { person: string } | { href: string };

const escapeText = (text: string) => text.replace(/[\\`*_{}\[\]<>#$|~!&]/g, "\\$&");

// Only links assigned by the discussion parser can open a destination.
export function formatDiscussionMath(text: string, people: ReadonlyMap<string, Mention>, budget: { remaining: number }) {
  if (!text.includes("$") && !text.includes("\\(") && !text.startsWith("\\[")) return null;
  const links = new Map<string, Target>();
  let linkGroup = 0;
  while (text.includes(`https://discussion.invalid/r${linkGroup}/`)) linkGroup++;
  let rendered = false;
  function formula(expression: string, display: boolean) {
    if (!expression.trim() || expression.length > 1000 || budget.remaining <= 0) {
      return escapeText(display ? `$$${expression}$$` : `$${expression}$`);
    }
    budget.remaining--;
    rendered = true;
    return display ? `$$${expression.trim()}$$` : `$${expression}$`;
  }
  function link(label: string, target: Target) {
    const id = `https://discussion.invalid/r${linkGroup}/${links.size}`;
    links.set(id, target);
    return `[${escapeText(label)}](${id})`;
  }
  function inline(line: string, depth = 0): string {
    if (depth >= 4) return escapeText(line);
    let markdown = "";
    let offset = 0;
    for (const match of line.matchAll(DISCUSSION_INLINE_PATTERN)) {
      markdown += escapeText(line.slice(offset, match.index));
      if (match[1] !== undefined) markdown += escapeText(match[1]);
      else if (match[2] !== undefined) {
        const href = safeDiscussionLink(match[3]);
        markdown += href ? link(match[2], { href }) : escapeText(match[2]);
      } else if (match[4] !== undefined) markdown += `**${inline(match[4], depth + 1)}**`;
      else if (match[5] !== undefined) markdown += `*${inline(match[5], depth + 1)}*`;
      else if (match[6] !== undefined) markdown += match[0];
      else if (match[7] !== undefined || match[8] !== undefined) markdown += formula(match[7] ?? match[8], false);
      else {
        const person = people.get(match[9].toLowerCase());
        markdown += person ? link("@" + person.name, { person: person.id }) : escapeText(match[0]);
      }
      offset = match.index + match[0].length;
    }
    return markdown + escapeText(line.slice(offset));
  }
  const display = (text.startsWith("$$") && text.endsWith("$$")) || (text.startsWith("\\[") && text.endsWith("\\]"));
  const markdown = display ? formula(text.slice(2, -2), true) : text.split("\n").map(line => {
    const heading = DISCUSSION_HEADING_LINE.exec(line);
    return heading ? `**${inline(heading[1])}**` : inline(line.replace(/^\s*[-*] /, "• "));
  }).join("\n");
  return rendered ? { markdown, links } : null;
}
