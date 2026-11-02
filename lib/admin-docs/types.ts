export type AdminDoc = {
  slug: string;
  category: string;
  title: string;
  summary: string;
  keywords: string[];
  sections: { title: string; paragraphs?: string[]; steps?: string[]; examples?: string[] }[];
};
