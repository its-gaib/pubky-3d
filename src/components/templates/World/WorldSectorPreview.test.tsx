import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { socialSectors } from '@/libs/world/world-social-layout';
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
    profileTags: [{ label: 'synonym', count: 32 }],
    profileTagsStatus: 'loaded',
    avatarUrl: `https://nexus.pubky.app/static/avatar/${id}`,
    color: '#c8ff03',
    position: [0, 0],
    bio: '',
  };
}
function props(people: WorldPerson[] = [follow(0)]) {
  return {
    sectors: socialSectors(people),
    sector: 0,
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

describe('complete named neighborhood preview', () => {
  it('preserves scroll and keyboard focus when the same tag moves to another slot during hydration', () => {
    const people = Array.from({ length: 24 }, (_, index) => follow(index));
    const options = props(people);
    const { rerender } = render(<WorldSectorPreview {...options} />);
    const list = screen.getByRole('list', { name: 'Following in Synonym' });
    const selected = screen.getByRole('button', { name: 'Preview Synonym, 24 following' });
    list.scrollTop = 80;
    selected.focus();
    const art = { ...follow(30), profileTags: [{ label: 'art', count: 3 }] };
    rerender(<WorldSectorPreview {...props([...people, art])} sector={1} />);
    expect(screen.getByRole('list', { name: 'Following in Synonym' })).toBe(list);
    expect(list.scrollTop).toBe(80);
    expect(screen.getByRole('button', { name: 'Preview Synonym, 24 following' })).toBe(selected);
    expect(selected).toHaveFocus();
    expect(selected).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers every follow through a readable scrollable page before entering the named group', async () => {
    const people = Array.from({ length: 42 }, (_, index) => follow(index));
    const options = props(people);
    const user = userEvent.setup();
    const { rerender } = render(<WorldSectorPreview {...options} />);
    const list = screen.getByRole('list', { name: 'Following in Synonym' });
    expect(list).toHaveAttribute('tabindex', '0');
    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
    expect(within(list).getAllByRole('img')).toHaveLength(20);
    expect(screen.getByRole('img', { name: `${people[2].name}’s profile picture` })).toHaveAttribute(
      'data-avatar-url',
      people[2].avatarUrl,
    );
    expect(screen.getByText('Follows 1–20 of 42')).toBeInTheDocument();
    expect(screen.getByText(/Community profile tag #synonym/)).toHaveTextContent('each follow appears once');
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
    await user.click(screen.getByRole('button', { name: 'Enter Synonym' }));
    expect(options.onEnter).toHaveBeenCalledWith(0);
  });

  it('keeps unfinished graphs and retries visible without presenting discoveries as direct follows', async () => {
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

  it('distinguishes pending, unavailable, and loaded untagged follows even when the graph is ready', async () => {
    const options = props([
      { ...follow(0), profileTags: undefined, profileTagsStatus: 'pending' },
      { ...follow(1), profileTags: undefined, profileTagsStatus: 'error' },
      { ...follow(2), profileTags: [] },
    ]);
    const user = userEvent.setup();
    render(<WorldSectorPreview {...options} />);
    expect(screen.getByText('Tags loading for 1 follow.')).toBeInTheDocument();
    expect(screen.getByText(/Tags unavailable for 1 follow/)).toBeInTheDocument();
    expect(screen.getByText('1 follow has no profile tags.')).toBeInTheDocument();
    expect(screen.getByText('Follows 1–3 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry tag loading' }));
    expect(options.social.retry).toHaveBeenCalledOnce();
  });

  it('uses truthful profile placeholders and plain bounded names independently of loaded tag metadata', () => {
    const unknown = { ...follow(0), profileLoaded: false, name: 'Not fetched yet' };
    const { rerender } = render(<WorldSectorPreview {...props([unknown])} />);
    expect(screen.getByText(`${unknown.id.slice(0, 6)}…${unknown.id.slice(-4)}`)).toBeInTheDocument();
    expect(screen.queryByText('Not fetched yet')).not.toBeInTheDocument();
    expect(screen.getByRole('img')).not.toHaveAttribute('data-avatar-url');
    expect(screen.getByRole('button', { name: 'Enter Synonym' })).toBeInTheDocument();
    rerender(
      <WorldSectorPreview {...props([{ ...unknown, profileLoaded: true, name: `Avery\u202E\n${'x'.repeat(70)}` }])} />,
    );
    const renderedName = screen.getByRole('listitem').querySelector('strong')!.textContent!;
    expect(renderedName.length).toBeLessThanOrEqual(48);
    expect(renderedName).not.toMatch(/[\p{Cc}\p{Cf}]/u);
  });

  it('uses meaningful neighborhood controls for a small circle and keeps the empty commons accessible', async () => {
    const options = props([follow(0), { ...follow(1), profileTags: [{ label: 'art', count: 3 }] }]);
    const user = userEvent.setup();
    const { rerender } = render(<WorldSectorPreview {...options} sector={1} />);
    await user.click(screen.getByRole('button', { name: 'Preview Art, 1 following' }));
    expect(options.onSector).toHaveBeenCalledWith(0);
    expect(screen.getByRole('button', { name: 'Enter Synonym' })).toBeEnabled();
    rerender(<WorldSectorPreview {...props([])} />);
    expect(screen.getByText('Follows 0–0 of 0')).toBeInTheDocument();
    expect(screen.getByText('No direct follows in this neighborhood.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter Other & untagged' })).toBeEnabled();
  });
});
