export interface ReferenceSource {
  uri?: string;
  url?: string;
  pmid?: string | null;
  source_type?: string | null;
  title?: string | null;
  author?: string | null;
  year?: string | null;
}

export type ReferenceBadgeKey = 'label' | 'guideline' | 'article' | 'book' | 'web';
export declare function referenceBadge(source: ReferenceSource | null | undefined): ReferenceBadgeKey;
export declare function referenceBadgeI18nKey(source: ReferenceSource | null | undefined): string;
export declare function referenceUrl(source: ReferenceSource | null | undefined): string;
export declare function linkifyCitations(text: string, sources: ReferenceSource[] | null | undefined): string;
