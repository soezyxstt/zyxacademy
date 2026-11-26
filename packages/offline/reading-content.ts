/** Fields validated by the offline client. Server article models may supply richer renderer data. */
export interface OfflineReadingBlock {
  id: string;
  blockType: string;
  content: string;
}

export interface OfflineReadingSection<Block extends OfflineReadingBlock = OfflineReadingBlock> {
  id: string;
  slug: string;
  blocks: Block[];
}

export interface OfflineReadingArticle<Section extends OfflineReadingSection = OfflineReadingSection> {
  id: string;
  courseId: string;
  chapterId: string | null;
  title: string;
  version: number;
  sections: Section[];
}

export type OfflineTextMaterial = {
  id: string;
  courseId: string;
  title: string;
  body: string;
  docCategory: "diktat" | "materi";
  kind: "article";
  contentVersion: number;
};

export type OfflineReadingContent = OfflineReadingArticle | OfflineTextMaterial;
