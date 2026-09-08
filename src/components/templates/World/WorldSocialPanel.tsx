'use client';

import { ArrowLeft, ArrowRight, Check, ChevronRight, Compass, LoaderCircle, Search, UserPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Input } from '@/atoms/Input/Input';
import type { useWorldSocial } from '@/hooks/useWorldSocial/useWorldSocial';
import type { WorldPerson } from '@/libs/world/world-types';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import styles from './World.module.css';

export type WorldSocialState = ReturnType<typeof useWorldSocial>;
export type WorldDirectoryScope = 'all' | 'following' | 'discovery';
export const WORLD_DIRECTORY_PAGE_SIZE = 20;

export function worldDirectoryPage(people: WorldPerson[], query: string, scope: WorldDirectoryScope, page: number) {
  const needle = query.trim().toLocaleLowerCase();
  const matches = people.filter(
    (person) =>
      (scope === 'all' || (scope === 'following' ? person.degree === 1 : person.degree === 2)) &&
      (!needle || person.id.toLowerCase().includes(needle) || person.name.toLocaleLowerCase().includes(needle)),
  );
  const pageCount = Math.max(1, Math.ceil(matches.length / WORLD_DIRECTORY_PAGE_SIZE));
  const current = Math.max(0, Math.min(Number.isFinite(page) ? Math.floor(page) : 0, pageCount - 1));
  return {
    people: matches.slice(current * WORLD_DIRECTORY_PAGE_SIZE, (current + 1) * WORLD_DIRECTORY_PAGE_SIZE),
    total: matches.length,
    page: current,
    pageCount,
  };
}

export function WorldPeopleDirectory({
  people,
  social,
  query,
  scope,
  page,
  onQuery,
  onScope,
  onPage,
  onSelect,
  onSignIn,
}: {
  people: WorldPerson[];
  social: WorldSocialState;
  query: string;
  scope: WorldDirectoryScope;
  page: number;
  onQuery: (value: string) => void;
  onScope: (scope: WorldDirectoryScope) => void;
  onPage: (page: number) => void;
  onSelect: (personId: string) => void;
  onSignIn: () => void;
}) {
  const directory = worldDirectoryPage(people, query, scope, page);
  const personal = Boolean(social.viewerId);
  const following = social.directCount;
  const discoveries = social.discoveryCount;
  return (
    <div className={styles.socialDirectory}>
      <div className={styles.socialLegend}>
        <span>
          <i className={styles.followingMarker} />
          You follow<strong>{following.toLocaleString()}</strong>
        </span>
        <span>
          <i className={styles.discoveryMarker} />
          One hop away<strong>{discoveries.toLocaleString()}</strong>
        </span>
      </div>
      <p className={styles.socialExplanation}>
        Your people stand tall in the inner circle. Their people gather in smaller outer constellations. Open a
        neighborhood to get closer, or find any discovered person here.
      </p>
      {!personal && (
        <div className={styles.socialNotice}>
          <p>Sign in to build your own circle. These are public production profiles.</p>
          <Button overrideDefaults className={styles.secondaryButton} onClick={onSignIn}>
            Sign in to see my circle
          </Button>
        </div>
      )}
      {personal && (
        <div className={styles.socialProgress} role="status" aria-live="polite">
          {social.status === 'loading' && <LoaderCircle size={15} className={styles.spin} aria-hidden="true" />}
          <span>
            {social.status === 'loading'
              ? 'Discovering your circle…'
              : social.complete
                ? 'Your circle is up to date with this snapshot.'
                : 'More of your circle is waiting to be discovered.'}
          </span>
          {(social.status === 'paused' || (!social.complete && social.status === 'ready')) && (
            <Button overrideDefaults className={styles.textLink} onClick={social.loadMore}>
              Continue discovering
              <ArrowRight size={14} />
            </Button>
          )}
          {social.status !== 'loading' && (
            <Button overrideDefaults className={styles.textLink} onClick={social.refresh}>
              Refresh circle
            </Button>
          )}
        </div>
      )}
      {personal && social.error && (
        <div className={styles.socialNotice} role="alert">
          <p>{social.error}</p>
          <Button overrideDefaults className={styles.textLink} onClick={social.retry}>
            Retry loading
            <ArrowRight size={14} />
          </Button>
        </div>
      )}
      <label className={styles.socialSearch}>
        <Search size={17} aria-hidden="true" />
        <Input
          aria-label="Find a person in the plaza"
          placeholder="Public key or loaded name"
          maxLength={120}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      {personal && (
        <div className={styles.socialFilters} role="group" aria-label="People to browse">
          {(['all', 'following', 'discovery'] as const).map((value) => (
            <Button key={value} overrideDefaults aria-pressed={scope === value} onClick={() => onScope(value)}>
              {value === 'all' ? 'Everyone' : value === 'following' ? 'Following' : 'One hop away'}
            </Button>
          ))}
        </div>
      )}
      <div className={styles.peopleGrid}>
        {directory.people.map((person) => (
          <Button
            key={person.id}
            overrideDefaults
            className={`${styles.personButton} ${person.degree === 2 ? styles.discoveryPerson : ''}`}
            onClick={() => onSelect(person.id)}
          >
            <span style={{ background: person.color }}>••</span>
            <strong>
              {person.name}
              <small>
                {person.degree === 1 ? 'Following' : person.degree === 2 ? 'One hop away' : 'Public profile'}
              </small>
            </strong>
            <ChevronRight size={16} />
          </Button>
        ))}
      </div>
      {!directory.total && (
        <p className={styles.socialExplanation}>
          {query
            ? 'No match yet. Try their public key; names appear as you browse.'
            : personal && social.complete
              ? 'Your circle has room to grow. Follow people from their Pubky profiles, then refresh here.'
              : 'People will appear here as your circle loads.'}
        </p>
      )}
      <div className={styles.directoryPaging} role="group" aria-label="Plaza directory pages">
        <Button
          overrideDefaults
          aria-label="Previous people page"
          disabled={directory.page === 0}
          onClick={() => onPage(directory.page - 1)}
        >
          <ArrowLeft size={16} />
        </Button>
        <span>
          {directory.total.toLocaleString()} people · {directory.page + 1} / {directory.pageCount}
        </span>
        <Button
          overrideDefaults
          aria-label="Next people page"
          disabled={directory.page + 1 >= directory.pageCount}
          onClick={() => onPage(directory.page + 1)}
        >
          <ArrowRight size={16} />
        </Button>
      </div>
      <p className={styles.smallPrint}>
        Profiles load as you browse; every discovered public key is searchable. These are profile markers, not online
        visitors.
      </p>
    </div>
  );
}

export function WorldPersonPanel({
  person,
  social,
  post,
  onSignIn,
  onVisit,
}: {
  person: WorldPerson;
  social: WorldSocialState;
  post: ReactNode;
  onSignIn: () => void;
  onVisit: (id: string) => void;
}) {
  const profile =
    social.profile.person?.id === person.id && social.profile.person.profileLoaded ? social.profile.person : person;
  const following = social.follow.isFollowing;
  const ownProfile = social.viewerId === person.id;
  return (
    <div className={styles.socialPersonPanel}>
      <div className={styles.personProfile}>
        <AvatarWithFallback
          key={profile.id}
          avatarUrl={profile.avatarUrl}
          name={profile.name}
          fallbackSeed={profile.id}
          alt={`${profile.name}’s profile picture`}
          size="xl"
          className={styles.personAvatar}
          data-testid="world-person-avatar"
        />
        <p>{profile.bio || 'This explorer has not added a bio.'}</p>
      </div>
      <div className={styles.personActions}>
        {ownProfile ? (
          <span className={styles.socialTier}>This is you</span>
        ) : (
          <Button
            overrideDefaults
            className={following ? styles.secondaryButton : styles.primaryButton}
            disabled={Boolean(social.viewerId) && (!social.follow.canFollow || social.follow.pending)}
            onClick={() => (social.viewerId ? void social.follow.toggle() : onSignIn())}
          >
            {social.follow.pending ? (
              <LoaderCircle size={17} className={styles.spin} />
            ) : following ? (
              <Check size={17} />
            ) : (
              <UserPlus size={17} />
            )}
            {!social.viewerId
              ? 'Sign in to follow'
              : social.follow.pending
                ? 'Syncing…'
                : following
                  ? 'Unfollow'
                  : 'Follow'}
          </Button>
        )}
        <Button overrideDefaults className={styles.secondaryButton} onClick={() => onVisit(person.id)}>
          <Compass size={17} />
          Meet in the plaza
        </Button>
      </div>
      {social.follow.error && (
        <div className={styles.socialNotice} role="alert">
          <p>{social.follow.error}</p>
          <Button
            overrideDefaults
            className={styles.textLink}
            disabled={social.follow.pending}
            onClick={() => void social.follow.retry()}
          >
            Retry syncing
            <ArrowRight size={14} />
          </Button>
        </div>
      )}
      <div className={styles.sectionLabel}>Latest post</div>
      {social.profile.status === 'loading' ? (
        <div className={styles.latestPostLoading} role="status">
          <LoaderCircle size={18} className={styles.spin} />
          Loading their latest post…
        </div>
      ) : social.profile.status === 'error' ? (
        <p role="status">{social.profile.error || 'Their latest post is unavailable right now.'}</p>
      ) : (
        post || <p className={styles.socialExplanation}>No public post is available yet.</p>
      )}
      <p className={styles.smallPrint}>
        Profile markers do not indicate live presence. Following changes their size in your plaza as the change syncs.
      </p>
    </div>
  );
}
