import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorldShirtIntroduction } from './WorldShirtIntroduction';

describe('WorldShirtIntroduction', () => {
  it('moves the same announcement with its speaker without repeating the announcement', () => {
    const { rerender } = render(<WorldShirtIntroduction speaker={{ id: 'human:crowd-0', x: 0.5, y: 0.6 }} />);
    const announcement = screen.getByRole('status', { name: 'A nearby explorer says' });
    expect(announcement).toHaveTextContent('I bought my shirt on style.ninja!');
    expect(announcement.parentElement).toHaveStyle({ '--speaker-x': '50%', '--speaker-y': '60%' });
    rerender(<WorldShirtIntroduction speaker={{ id: 'human:crowd-0', x: 0.3, y: 0.7 }} reducedMotion />);
    expect(screen.getByRole('status')).toBe(announcement);
    expect(announcement.parentElement).toHaveStyle({ '--speaker-x': '30%', '--speaker-y': '70%' });
    expect(announcement.parentElement).toHaveAttribute('data-reduced-motion', 'true');
  });
});
