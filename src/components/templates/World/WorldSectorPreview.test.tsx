import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { socialSector, socialSectors } from '@/libs/world/world-social-layout';
import type { WorldPerson } from '@/libs/world/world-types';
import { WorldSectorPreview } from './WorldSectorPreview';

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: ({ name, avatarUrl }: { name: string; avatarUrl?: string }) => (
    <span role="img" aria-label={`${name}’s profile picture`} data-avatar-url={avatarUrl} />
  ),
}));

function follow(index: number): WorldPerson {
  const id = index.toString(36).padStart(52, '0');
  return {
    id,
    name: `Friend ${index}`,
    degree: 1,
    profileLoaded: true,
    avatarUrl: `https://nexus.pubky.app/static/avatar/${id}`,
    color: '#c8ff03',
    position: [0, 0],
    bio: '',
  };
}

function props(people: WorldPerson[] = [follow(0)]) {
  return {
    sectors: socialSectors(people),
    sector: socialSector(people[0]?.id ?? follow(0).id),
    page: 0,
    personal: true,
    social: {
      status: 'ready' as const,
      complete: true,
      error: null as string | null,
      loadMore: vi.fn(),
      retry: vi.fn(),
    },
    onSector: vi.fn(),
    onPage: vi.fn(),
    onEnter: vi.fn(),
    onSignIn: vi.fn(),
  };
}

describe('complete social sector preview', () => {
  it('offers readable names and avatars in a scrollable page with explicit controls before entering', async () => {
    const people = Array.from({ length: 500 }, (_, index) => follow(index))
      .filter((person) => socialSector(person.id) === 0)
      .slice(0, 42);
    const options = props(people);
    const user = userEvent.setup();
    const { rerender } = render(<WorldSectorPreview {...options} />);
    const list = screen.getByRole('list', { name: 'Following in sector 1' });
    expect(list).toHaveAttribute('tabindex', '0');
    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
    expect(within(list).getAllByRole('img')).toHaveLength(20);
    expect(screen.getByRole('img', { name: `${people[2].name}’s profile picture` })).toHaveAttribute(
      'data-avatar-url',
      people[2].avatarUrl,
    );
    expect(screen.getByText('Follows 1–20 of 42')).toBeInTheDocument();
    expect(screen.queryByText(people[20].name)).not.toBeInTheDocument();
    expect(options.onEnter).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Next sector preview page' }));
    expect(options.onPage).toHaveBeenCalledWith(1);
    list.scrollTop = 80;
    rerender(<WorldSectorPreview {...options} page={2} />);
    expect(list.scrollTop).toBe(0);
    expect(screen.getByText('Follows 41–42 of 42')).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(people[41].name)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next sector preview page' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Enter sector 1' }));
    expect(options.onEnter).toHaveBeenCalledWith(0);
  });

  it('keeps unfinished graphs and load-more failures visible without presenting discoveries as follows', async () => {
    const direct = follow(0);
    const options = props([direct, { ...follow(1), degree: 2, parentIds: [direct.id] }]);
    const user = userEvent.setup();
    const { rerender } = render(
      <WorldSectorPreview {...options} social={{ ...options.social, complete: false, status: 'loading' }} />,
    );
    expect(screen.getByText(/Discovering your circle/)).toBeInTheDocument();
    expect(screen.getByText('2 people · 1 following')).toBeInTheDocument();
    expect(screen.getByText('Follows 1–1 of 1')).toBeInTheDocument();
    expect(screen.queryByText('Friend 1')).not.toBeInTheDocument();
    rerender(<WorldSectorPreview {...options} social={{ ...options.social, complete: false, status: 'paused' }} />);
    expect(screen.getByText(/follows found so far/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue discovering' }));
    expect(options.social.loadMore).toHaveBeenCalledOnce();
    rerender(
      <WorldSectorPreview
        {...options}
        social={{ ...options.social, complete: false, status: 'error', error: 'Could not load your circle.' }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your circle.');
    await user.click(screen.getByRole('button', { name: 'Retry loading' }));
    expect(options.social.retry).toHaveBeenCalledOnce();
  });

  it('uses public-key placeholders and plain bounded names, and makes small or empty sectors reachable', async () => {
    const unknown = { ...follow(0), profileLoaded: false, name: 'Not fetched yet' };
    const options = props([unknown]);
    const user = userEvent.setup();
    const { rerender } = render(<WorldSectorPreview {...options} />);
    expect(screen.getByText(`${unknown.id.slice(0, 6)}…${unknown.id.slice(-4)}`)).toBeInTheDocument();
    expect(screen.queryByText('Not fetched yet')).not.toBeInTheDocument();
    expect(screen.getByRole('img')).not.toHaveAttribute('data-avatar-url');
    const value = `Avery\u202E\n${'x'.repeat(70)}`;
    const person = { ...unknown, name: value, profileLoaded: true };
    const loaded = props([person]);
    rerender(<WorldSectorPreview {...loaded} />);
    const row = screen.getByRole('listitem');
    const renderedName = row.querySelector('strong')!.textContent!;
    expect(renderedName.length).toBeLessThanOrEqual(48);
    expect(renderedName).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    const emptySector = (options.sector + 1) % 8;
    await user.click(screen.getByRole('button', { name: `Preview sector ${emptySector + 1}, 0 following` }));
    expect(loaded.onSector).toHaveBeenCalledWith(emptySector);
    rerender(<WorldSectorPreview {...props([])} sector={emptySector} />);
    expect(screen.getByText('Follows 0–0 of 0')).toBeInTheDocument();
    expect(screen.getByText('No direct follows in this sector.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Enter sector ${emptySector + 1}` })).toBeEnabled();
  });
});
