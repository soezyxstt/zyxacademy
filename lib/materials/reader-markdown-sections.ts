interface ArticleSection {
  title: string;
  content: string;
}

export function parseArticleSections(body: string, defaultTitle: string): { chapterTitle: string; sections: ArticleSection[] } {
  if (!body) return { chapterTitle: defaultTitle, sections: [] };

  const hasSections = body.includes("##") || body.includes("###");
  if (!hasSections) {
    return {
      chapterTitle: defaultTitle,
      sections: [{ title: "Materi", content: body }]
    };
  }

  // 1. Extract Chapter Title
  let chapterTitle = defaultTitle;
  let cleanBody = body;

  const h1Match = body.match(/^#\s+([^\n]+)/m);
  if (h1Match) {
    chapterTitle = h1Match[1].trim();
    const headerIndex = body.indexOf(h1Match[0]);
    if (headerIndex !== -1) {
      const endOfHeading = body.indexOf("\n", headerIndex);
      cleanBody = body.slice(endOfHeading !== -1 ? endOfHeading : headerIndex);
    }
  } else {
    const firstHeaderMatch = body.match(/^##\s+Bab\s+\d+:\s+([^\n]+)/im);
    if (firstHeaderMatch) {
      chapterTitle = firstHeaderMatch[0].replace(/^##\s+/, "").trim();
      const headerIndex = body.indexOf(firstHeaderMatch[0]);
      if (headerIndex !== -1) {
        const endOfHeading = body.indexOf("\n", headerIndex);
        cleanBody = body.slice(endOfHeading !== -1 ? endOfHeading : headerIndex);
      }
    }
  }

  // Clean top-level dividers
  cleanBody = cleanBody.replace(/^[\s\r\n]*---[\s\r\n]*/, "");

  // 2. Remove Metadata blocks
  cleanBody = cleanBody
    .replace(/#### Knowledge Graph Metadata[\s\S]*?(?=(?:---|\r?\n###|\r?\n##|\r?\n####|$))/g, "")
    .replace(/#### Metadata[\s\S]*?(?=(?:---|\r?\n###|\r?\n##|\r?\n####|$))/g, "");

  // Remove Concept Hierarchy block completely
  cleanBody = cleanBody.replace(/##\s+Concept\s+Hierarchy[\s\S]*?(?=(?:---|\r?\n###|\r?\n##|\r?\n####|$))/gi, "");

  // 3. Parse into blocks
  interface HeadingBlock {
    level: 2 | 3;
    title: string;
    contentLines: string[];
  }

  const blocks: HeadingBlock[] = [];
  let currentBlock: HeadingBlock | null = null;
  const introLines: string[] = [];

  const lines = cleanBody.split(/\r?\n/);
  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.*)/);
    const h3Match = line.match(/^###\s+(.*)/);

    if (h2Match) {
      currentBlock = {
        level: 2,
        title: h2Match[1].trim(),
        contentLines: []
      };
      blocks.push(currentBlock);
    } else if (h3Match) {
      currentBlock = {
        level: 3,
        title: h3Match[1].trim(),
        contentLines: []
      };
      blocks.push(currentBlock);
    } else {
      if (currentBlock) {
        currentBlock.contentLines.push(line);
      } else {
        introLines.push(line);
      }
    }
  }

  const sections: ArticleSection[] = [];
  const formulaSections: ArticleSection[] = [];
  let currentH2Intro: string = introLines.join("\n").trim();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.level === 2) {
      let hasH3UnderIt = false;
      for (let j = i + 1; j < blocks.length; j++) {
        if (blocks[j].level === 2) break;
        if (blocks[j].level === 3) {
          hasH3UnderIt = true;
          break;
        }
      }

      if (hasH3UnderIt) {
        const blockContent = block.contentLines.join("\n").trim();
        if (blockContent) {
          if (currentH2Intro) {
            currentH2Intro += "\n\n" + blockContent;
          } else {
            currentH2Intro = blockContent;
          }
        }
      } else {
        let content = block.contentLines.join("\n").trim();
        if (currentH2Intro) {
          content = currentH2Intro + "\n\n" + content;
          currentH2Intro = "";
        }

        if (/^F-\d+/i.test(block.title)) {
          const subHeading = `### ${block.title}\n\n`;
          formulaSections.push({ title: block.title, content: subHeading + content });
        } else {
          sections.push({ title: block.title, content });
        }
      }
    } else if (block.level === 3) {
      let content = block.contentLines.join("\n").trim();
      if (currentH2Intro) {
        content = currentH2Intro + "\n\n" + content;
        currentH2Intro = "";
      }

      if (/^F-\d+/i.test(block.title)) {
        const subHeading = `### ${block.title}\n\n`;
        formulaSections.push({ title: block.title, content: subHeading + content });
      } else {
        sections.push({ title: block.title, content });
      }
    }
  }

  if (formulaSections.length > 0) {
    const groupedContent = formulaSections.map(fs => fs.content).join("\n\n---\n\n");
    sections.push({
      title: "Daftar Rumus",
      content: groupedContent
    });
  }

  return { chapterTitle, sections };
}
