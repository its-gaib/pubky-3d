import validationLimits from 'pubky-app-specs/validationLimits.json';
import { describe, expect, it, vi } from 'vitest';
import * as markdown from '@/libs/post/markdownToText';
import { worldPostPreview } from './world-post-preview';

describe('worldPostPreview', () => {
  it('shows an article title and readable body instead of its JSON and HTML', () => {
    const content = JSON.stringify({
      title: '**A day in Pubky**',
      body: '<p>Hello <strong>world</strong>.</p>\n\nRead [the story](https://pubky.org).',
    });
    expect(worldPostPreview({ content, kind: 'long' })).toBe('A day in Pubky\n\nHello world. Read the story.');
  });

  it('shows a collection name and description without its items or cover metadata', () => {
    const content = JSON.stringify({
      name: 'Good reads',
      description: '<p>A **curious** collection.</p>',
      items: ['pubky://example/private-looking-metadata'],
      cover_image: 'https://example.com/image.png',
    });
    expect(worldPostPreview({ content, kind: 'collection' })).toBe('Good reads\n\nA curious collection.');
  });

  it.each(['long', 'collection'])('never falls back to raw malformed %s content', (kind) => {
    for (const content of ['{"title":', '<h1>not an envelope</h1>', '{"items":[]}']) {
      expect(worldPostPreview({ content, kind })).toBe('Preview unavailable. Open this post in Pubky to read it.');
    }
  });

  it('parses complete articles before bounding the preview and rejects oversized payloads', () => {
    const content = JSON.stringify({ title: 'Long article', body: 'Readable content. '.repeat(300) });
    const preview = worldPostPreview({ content, kind: 'long' });
    expect(preview).toHaveLength(1200);
    expect(preview).toMatch(/^Long article\n\nReadable content\./);
    expect(worldPostPreview({ content: 'x'.repeat(validationLimits.postLongContentMaxLength + 1), kind: 'long' })).toBe(
      'Preview unavailable. Open this post in Pubky to read it.',
    );
  });

  it('keeps intentional JSON short posts as text while removing HTML from prose', () => {
    const content = '{"title":"This is a code example","body":"not an article"}';
    expect(worldPostPreview({ content, kind: 'short' })).toBe(content);
    expect(worldPostPreview({ content: '<p>A <em>little</em> more alive.</p>', kind: 'short' })).toBe(
      'A little more alive.',
    );
  });

  it('bounds Markdown processing even for a complete article near the protocol limit', () => {
    const cleaner = vi.spyOn(markdown, 'markdownToText');
    try {
      const content = JSON.stringify({ title: 'A complete envelope', body: '['.repeat(49_000) });
      const preview = worldPostPreview({ content, kind: 'long' });
      expect(preview).toMatch(/^A complete envelope\n\n/);
      expect(cleaner).toHaveBeenCalled();
      for (const [text] of cleaner.mock.calls) expect(text?.length).toBeLessThanOrEqual(2048);
      expect(preview.length).toBeLessThanOrEqual(1200);
    } finally {
      cleaner.mockRestore();
    }
  });

  it('handles attachment-only, deleted, and missing content without a stuck loading state', () => {
    expect(worldPostPreview({ content: '', kind: 'image' })).toBe(
      'This post contains an attachment. Open it in the feed to view it.',
    );
    expect(worldPostPreview({ content: '[DELETED]', kind: 'long' })).toBe('This post has been deleted by its author.');
    expect(worldPostPreview({ content: null, kind: 'long' })).toBe(
      'Preview unavailable. Open this post in Pubky to read it.',
    );
  });
});
