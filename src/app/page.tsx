import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pubky World — A little more alive',
  description:
    'A playful, walkable Pubky world. Explore a forest of tags, social constellations, and a campus for the open web.',
};

export { World as default } from '@/templates/World/World';
