'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bird,
  Camera,
  Check,
  CircuitBoard,
  CodeXml,
  Compass,
  Crown,
  Flame,
  Gauge,
  GraduationCap,
  ImagePlus,
  KeyRound,
  LockKeyhole,
  MoveUp,
  Music2,
  Orbit,
  Repeat2,
  Rocket,
  Shield,
  ShieldCheck,
  ShieldX,
  Skull,
  Swords,
  Timer,
  Trophy,
  UnlockKeyhole,
  UserPlus,
  Users,
  Waypoints,
  X,
} from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/atoms/Dialog/Dialog';
import {
  WORLD_ACHIEVEMENTS,
  type WorldAchievementId,
  type WorldAchievementProgress,
} from '@/libs/world/world-achievements';
import worldStyles from './World.module.css';
import styles from './WorldAchievements.module.css';

const BADGE_ICONS: Partial<Record<WorldAchievementId, typeof Trophy>> = {
  keymaster: KeyRound,
  'world-rider': Waypoints,
  plaguebreaker: ShieldCheck,
  'arena-champion': Crown,
  'glorious-end': ShieldX,
  'first-freedom': UnlockKeyhole,
  'island-explorer': Compass,
  'dragon-whisperer': Bird,
  'through-the-fire': Flame,
  'skys-the-limit': Rocket,
  'frequent-flyer': Timer,
  'stunt-collector': Repeat2,
  'pedal-to-the-metal': Gauge,
  'bounce-knight': MoveUp,
  'portal-pilgrim': Orbit,
  'dance-break': Music2,
  'zombie-jouster': Swords,
  'walking-apocalypse': Skull,
  'island-photographer': Camera,
  'social-butterfly': Users,
  'against-the-horde': Shield,
  'picture-this': ImagePlus,
  'follow-the-signal': UserPlus,
  'sovereign-scholar': GraduationCap,
  'synonym-circuit': CircuitBoard,
  'open-source-adventurer': CodeXml,
};

export function WorldAchievements({
  earned,
  celebration,
  showCelebration,
  reducedMotion,
  zombie = false,
  onDismissCelebration,
  onOpenChange,
  onReturnFocus,
}: {
  earned: readonly WorldAchievementId[];
  progress: readonly WorldAchievementProgress[];
  celebration: WorldAchievementId | null;
  showCelebration: boolean;
  reducedMotion: boolean;
  zombie?: boolean;
  onDismissCelebration: () => void;
  onOpenChange: (open: boolean) => void;
  onReturnFocus: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dismissRef = useRef(onDismissCelebration);
  const award = WORLD_ACHIEVEMENTS.find((achievement) => achievement.id === celebration);
  const AwardIcon = BADGE_ICONS[celebration ?? 'keymaster'] ?? Trophy;

  useEffect(() => {
    dismissRef.current = onDismissCelebration;
  }, [onDismissCelebration]);
  useEffect(() => {
    onOpenChange(open);
  }, [open, onOpenChange]);
  useEffect(() => {
    if (!celebration || !showCelebration || open) return;
    const timeout = window.setTimeout(() => dismissRef.current(), 6000);
    return () => window.clearTimeout(timeout);
  }, [celebration, showCelebration, open]);

  return (
    <>
      <Button
        overrideDefaults
        className={styles.collectionButton}
        aria-label="View achievements"
        title={`${earned.length} of ${WORLD_ACHIEVEMENTS.length} achievements earned`}
        onClick={() => setOpen(true)}
      >
        <Trophy size={17} aria-hidden="true" />
        <span>
          {earned.length}/{WORLD_ACHIEVEMENTS.length}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          overrideDefaults
          showCloseButton={false}
          className={`${worldStyles.dialog} ${styles.collection}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onReturnFocus();
          }}
        >
          <DialogClose asChild>
            <Button overrideDefaults className={worldStyles.closeButton} aria-label="Close achievements">
              <X size={20} />
            </Button>
          </DialogClose>
          <div className={worldStyles.dialogEyebrow}>
            <Trophy size={14} aria-hidden="true" /> LEGENDS OF THE ISLAND
          </div>
          <DialogTitle className={worldStyles.dialogTitle}>Your achievements</DialogTitle>
          <DialogDescription className={worldStyles.dialogDescription}>
            {WORLD_ACHIEVEMENTS.length} challenges to make your mark. Earned badges stay with this browser, even after a
            new life.
          </DialogDescription>
          <div className={styles.badgeGrid}>
            {WORLD_ACHIEVEMENTS.map((achievement) => {
              const unlocked = earned.includes(achievement.id);
              const Icon = unlocked ? (BADGE_ICONS[achievement.id] ?? Trophy) : LockKeyhole;
              return (
                <article
                  key={achievement.id}
                  className={styles.badgeCard}
                  data-earned={unlocked}
                  aria-label={unlocked ? achievement.title : 'Locked achievement'}
                >
                  <div className={styles.badgeMedal}>
                    <Icon size={29} strokeWidth={1.6} aria-hidden="true" />
                    {unlocked && <Check size={14} className={styles.badgeStateIcon} aria-hidden="true" />}
                  </div>
                  <h3>{unlocked ? achievement.title : 'Mystery badge'}</h3>
                  <p>{unlocked ? achievement.description : 'Keep exploring to discover this achievement.'}</p>
                  <span className={styles.badgeState}>{unlocked ? 'Earned' : 'Locked'}</span>
                </article>
              );
            })}
          </div>
          <p className={styles.collectionFootnote}>
            Unfinished challenges restart with each new island. Your earned badges remain.
          </p>
        </DialogContent>
      </Dialog>

      {award && showCelebration && !open && (
        <aside
          key={award.id}
          className={styles.celebration}
          data-reduced-motion={reducedMotion}
          data-zombie={zombie}
          role="status"
          aria-label="Achievement unlocked"
        >
          <div className={styles.celebrationMedal}>
            <AwardIcon size={37} strokeWidth={1.6} aria-hidden="true" />
          </div>
          <div className={styles.celebrationCopy}>
            <span>ACHIEVEMENT UNLOCKED</span>
            <strong>{award.title}</strong>
            <p>{award.description}</p>
          </div>
        </aside>
      )}
    </>
  );
}
