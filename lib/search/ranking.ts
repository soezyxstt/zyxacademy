export interface RankableSearchDocument {
  title: string;
  subtitle?: string;
  keywords?: string;
  content?: string;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function exactTokenMatches(queryTokens: string[], value: string) {
  const valueTokens = new Set(normalizeSearchText(value).split(" ").filter(Boolean));
  return queryTokens.filter((token) => valueTokens.has(token)).length;
}

export function getSearchRelevanceScore(
  query: string,
  document: RankableSearchDocument
) {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTitle = normalizeSearchText(document.title);
  if (!normalizedQuery || !normalizedTitle) return 0;

  const queryTokens = normalizedQuery.split(" ");
  const titleTokens = normalizedTitle.split(" ");
  const titleTokenSet = new Set(titleTokens);
  const titleMatchCount = queryTokens.filter((token) =>
    titleTokenSet.has(token)
  ).length;
  const titleCoverage = titleMatchCount / queryTokens.length;
  const titleDensity = titleMatchCount / titleTokens.length;

  let score = titleCoverage * 2_000 + titleDensity * 400;

  if (normalizedTitle === normalizedQuery) {
    score += 10_000;
  } else if (normalizedTitle.startsWith(`${normalizedQuery} `)) {
    score += 7_000;
  } else if (normalizedTitle.includes(normalizedQuery)) {
    score += 5_000;
  }

  let lastTitleIndex = -1;
  let orderedMatches = 0;
  for (const token of queryTokens) {
    const titleIndex = titleTokens.indexOf(token, lastTitleIndex + 1);
    if (titleIndex === -1) continue;
    orderedMatches += 1;
    lastTitleIndex = titleIndex;
  }
  score += (orderedMatches / queryTokens.length) * 300;

  const numericQueryTokens = queryTokens.filter((token) => /^\d+$/.test(token));
  if (numericQueryTokens.length > 0) {
    const numericMatches = numericQueryTokens.filter((token) =>
      titleTokenSet.has(token)
    ).length;
    score += numericMatches * 2_000;

    const titleHasDifferentNumber = titleTokens.some(
      (token) => /^\d+$/.test(token) && !numericQueryTokens.includes(token)
    );
    if (numericMatches === 0 && titleHasDifferentNumber) {
      score -= 1_000;
    }
  }

  score += exactTokenMatches(queryTokens, document.subtitle ?? "") * 80;
  score += exactTokenMatches(queryTokens, document.keywords ?? "") * 40;
  score +=
    exactTokenMatches(queryTokens, document.content?.slice(0, 2_000) ?? "") *
    10;

  return score;
}

export function rankSearchDocuments<T extends RankableSearchDocument>(
  query: string,
  documents: T[]
) {
  return documents
    .map((document, index) => ({
      document,
      index,
      score: getSearchRelevanceScore(query, document),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ document }) => document);
}
