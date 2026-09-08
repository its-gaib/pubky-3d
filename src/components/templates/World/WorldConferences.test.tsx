import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WORLD_CONFERENCES } from '@/libs/world/world-conference-catalog';
import { WorldConferences } from './WorldConferences';

describe('conference departure tickets', () => {
  it('shows all three verified destinations and links directly to their official sites', () => {
    render(<WorldConferences />);
    for (const event of WORLD_CONFERENCES) {
      expect(screen.getByRole('heading', { name: event.name })).toBeInTheDocument();
      expect(screen.getByText(event.dateLabel)).toBeInTheDocument();
    }
    const links = screen.getAllByRole('link', { name: 'Explore the event' });
    expect(links).toHaveLength(3);
    links.forEach((link, index) => {
      expect(link).toHaveAttribute('href', WORLD_CONFERENCES[index].url);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('opens only the ticket discovered in the world', () => {
    render(<WorldConferences index={2} />);
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: WORLD_CONFERENCES[2].name })).toBeInTheDocument();
    expect(screen.queryByText(WORLD_CONFERENCES[0].name)).not.toBeInTheDocument();
  });
});
