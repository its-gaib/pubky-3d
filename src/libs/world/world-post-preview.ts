import validationLimits from 'pubky-app-specs/validationLimits.json';
import { parseArticleContent } from '@/libs/post/articleContent';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { markdownToText } from '@/libs/post/markdownToText';
import { isPostDeleted } from '@/libs/utils/utils';

const PREVIEW_LENGTH = 1_200;
const MARKDOWN_INPUT_LENGTH = 2_048;
const UNAVAILABLE = 'Preview unavailable. Open this post in Pubky to read it.';
const ATTACHMENT = 'This post contains an attachment. Open it in the feed to view it.';

/** Normalize stored content before it reaches either the 3D screen or its reader. */
export function worldPostPreview({ content, kind }: { content: unknown; kind?: string }): string {
  if (typeof content !== 'string') return UNAVAILABLE;
  if (isPostDeleted(content)) return 'This post has been deleted by its author.';
  // Parse a complete envelope, never a truncated JSON prefix. Bound parsing and
  // Markdown work even if a malformed cached record exceeds the protocol limit.
  if (content.length > validationLimits.postLongContentMaxLength) return UNAVAILABLE;

  let parts: string[];
  if (kind === 'long') {
    const article = parseArticleContent(content);
    if (!article) return UNAVAILABLE;
    parts = [article.title, article.body];
  } else if (kind === 'collection') {
    const collection = parseCollectionContent(content);
    if (!collection) return UNAVAILABLE;
    parts = [collection.name, collection.description ?? ''];
  } else {
    // A short post may intentionally contain JSON. Its kind, not punctuation,
    // determines whether the content is a structured article/collection envelope.
    parts = [content];
  }

  const preview = parts
    .map((part) =>
      // Bound regex-based Markdown cleanup separately from complete JSON parsing.
      markdownToText(part.slice(0, MARKDOWN_INPUT_LENGTH))
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+([,.;!?])/g, '$1')
        .trim(),
    )
    .filter(Boolean)
    .join('\n\n')
    .slice(0, PREVIEW_LENGTH);
  return preview || (kind === 'long' || kind === 'collection' ? UNAVAILABLE : ATTACHMENT);
}
