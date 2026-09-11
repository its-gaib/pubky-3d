'use client';

import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Footprints, LoaderCircle } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import type { UseWorldSocialResult } from '@/hooks/useWorldSocial/useWorldSocial.types';
import {
  socialPersonPreviewName,
  type SocialSector,
  socialSectorCountLabel,
  socialSectorFollowingPage,
} from '@/libs/world/world-social-layout';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import styles from './WorldSectorPreview.module.css';

interface WorldSectorPreviewProps {
  sectors: SocialSector[];
  sector: number;
  page: number;
  personal: boolean;
  social: Pick<UseWorldSocialResult, 'status' | 'complete' | 'error' | 'loadMore' | 'retry'>;
  onSector: (sector: number) => void;
  onPage: (page: number) => void;
  onEnter: (sector: number) => void;
  onSignIn: () => void;
}

/** A small DOM window into the full sector, independent of the bounded 3D crowd. */
export function WorldSectorPreview({
  sectors,
  sector: index,
  page,
  personal,
  social,
  onSector,
  onPage,
  onEnter,
  onSignIn,
}: WorldSectorPreviewProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const sector = sectors[index] ?? sectors[0];
  const directory = socialSectorFollowingPage(sector, page);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [sector.key, directory.page]);

  return (
    <div className={styles.preview}>
      <div className={styles.sectors} role="group" aria-label="Preview a sector">
        {sectors.map((item) => (
          <Button
            overrideDefaults
            key={item.key}
            aria-label={`Preview ${item.label}, ${item.following.length.toLocaleString('en')} following`}
            aria-pressed={item.sector === index}
            onClick={() => onSector(item.sector)}
          >
            <strong>{item.label}</strong>
            <span>{item.following.length.toLocaleString('en')} following</span>
          </Button>
        ))}
      </div>
      <p className={styles.counts}>
        {personal ? socialSectorCountLabel(sector) : `${sector.members.length.toLocaleString('en')} public profiles`}
      </p>
      <p className={styles.explanation}>
        {sector.tag
          ? `Community profile tag #${sector.tag}. People with shared tags gather together, and each follow appears once.`
          : 'A home for people with other tags, no tags, or tags still on their way. Everybody keeps a place.'}
      </p>
      {personal ? (
        <>
          <p className={styles.explanation}>
            Find your familiar faces before you step inside. Every follow has a place.
          </p>
          <div className={styles.paging} role="group" aria-label="Sector preview pages">
            <Button
              overrideDefaults
              aria-label="Previous sector preview page"
              disabled={directory.page === 0}
              onClick={() => onPage(directory.page - 1)}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Previous
            </Button>
            <span role="status" aria-live="polite">
              Follows {directory.start.toLocaleString('en')}–{directory.end.toLocaleString('en')} of{' '}
              {directory.total.toLocaleString('en')}
            </span>
            <Button
              overrideDefaults
              aria-label="Next sector preview page"
              disabled={directory.page + 1 >= directory.pageCount}
              onClick={() => onPage(directory.page + 1)}
            >
              Next
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
          {directory.people.length ? (
            <ul ref={listRef} className={styles.people} aria-label={`Following in ${sector.label}`} tabIndex={0}>
              {directory.people.map((person) => {
                const name = socialPersonPreviewName(person);
                return (
                  <li key={person.id} className={styles.person}>
                    <AvatarWithFallback
                      avatarUrl={person.profileLoaded === false ? undefined : person.avatarUrl}
                      name={name}
                      fallbackSeed={person.id}
                      alt={`${name}’s profile picture`}
                      className={styles.avatar}
                    />
                    <div>
                      <strong>{name}</strong>
                      <span>
                        {person.profileLoaded === false
                          ? 'Public key · profile not loaded'
                          : `${person.id.slice(0, 6)}…${person.id.slice(-4)}`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.empty}>No direct follows in this neighborhood{social.complete ? '.' : ' yet.'}</p>
          )}
          <div className={styles.progress}>
            {sector.tagStatus.pending > 0 && (
              <p role="status">
                Tags loading for {sector.tagStatus.pending.toLocaleString('en')}{' '}
                {sector.tagStatus.pending === 1 ? 'follow' : 'follows'}.
              </p>
            )}
            {sector.tagStatus.untagged > 0 && (
              <p>
                {sector.tagStatus.untagged.toLocaleString('en')}{' '}
                {sector.tagStatus.untagged === 1 ? 'follow has' : 'follows have'} no profile tags.
              </p>
            )}
            {sector.tagStatus.other > 0 && (
              <p>
                {sector.tagStatus.other.toLocaleString('en')}{' '}
                {sector.tagStatus.other === 1 ? 'follow has' : 'follows have'} tags outside the featured neighborhoods.
              </p>
            )}
            {sector.tagStatus.unavailable > 0 && (
              <div>
                <p>
                  Tags unavailable for {sector.tagStatus.unavailable.toLocaleString('en')}{' '}
                  {sector.tagStatus.unavailable === 1 ? 'follow' : 'follows'}. Everyone remains here.
                </p>
                {!social.error && (
                  <Button overrideDefaults className={styles.textButton} onClick={social.retry}>
                    Retry tag loading
                  </Button>
                )}
              </div>
            )}
            {social.status === 'loading' ? (
              <p role="status">
                <LoaderCircle size={14} className={styles.spin} aria-hidden="true" />
                Discovering your circle… These are the follows found so far.
              </p>
            ) : social.complete ? (
              <p>Every loaded follow in this sector is available above. Names and pictures load as you browse.</p>
            ) : (
              <p>These are the follows found so far. Keep discovering to reach the rest of your circle.</p>
            )}
            {!social.complete && (social.status === 'paused' || social.status === 'ready') && (
              <Button overrideDefaults className={styles.textButton} onClick={social.loadMore}>
                Continue discovering
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
            )}
            {social.error && (
              <div role="alert">
                <p>{social.error}</p>
                <Button overrideDefaults className={styles.textButton} onClick={social.retry}>
                  Retry loading
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className={styles.progress}>
          <p>Sign in to see everyone you follow in each sector. You can still explore the public plaza.</p>
          <Button overrideDefaults className={styles.textButton} onClick={onSignIn}>
            Sign in to see your circle
            <ArrowRight size={14} aria-hidden="true" />
          </Button>
        </div>
      )}
      <Button overrideDefaults className={styles.enter} onClick={() => onEnter(index)}>
        Enter {sector.label}
        <Footprints size={18} aria-hidden="true" />
      </Button>
    </div>
  );
}
