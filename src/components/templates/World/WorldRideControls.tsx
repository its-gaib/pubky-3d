'use client';

import { type FocusEvent, type KeyboardEvent, type PointerEvent, useEffect, useId, useRef } from 'react';
import { ArrowDown, ArrowUp, Gauge, LogOut, Sparkles } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { worldRideCanFly, worldRideIsAutonomous } from '@/libs/world/world-transport-motion';
import type { WorldController, WorldStatus } from '@/libs/world/world-types';
import styles from './WorldRideControls.module.css';

interface WorldRideControlsProps {
  ride: NonNullable<WorldStatus['ride']>;
  onLift: WorldController['setRideLift'];
  onStunt: () => void;
  onGetOff: () => void;
}

type LiftDirection = -1 | 1;
const KEYBOARD_POINTER = -1;

/** Contextual controls for the ride already discovered in the world. */
export function WorldRideControls({ ride, onLift, onStunt, onGetOff }: WorldRideControlsProps) {
  const hintId = useId();
  const onLiftRef = useRef(onLift);
  const held = useRef<{ up: number | null; down: number | null }>({ up: null, down: null });
  const autonomous = worldRideIsAutonomous(ride.id);
  const flying = worldRideCanFly(ride.id);
  const getOffHint = autonomous
    ? ride.landing
      ? 'Finding clear ground and landing…'
      : null
    : !ride.grounded
      ? 'Land to step off'
      : ride.stunt
        ? 'Finish the stunt to step off'
        : null;
  const speed = Math.min(999, Math.round(Number.isFinite(ride.speed) ? Math.abs(ride.speed) : 0));
  const altitude = Math.min(999, Math.round(Number.isFinite(ride.altitude) ? Math.max(0, ride.altitude) : 0));

  useEffect(() => {
    onLiftRef.current = onLift;
  }, [onLift]);

  useEffect(() => {
    const reset = () => {
      held.current = { up: null, down: null };
      onLiftRef.current(0);
    };
    reset();
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
    return () => {
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', reset);
      reset();
    };
  }, [ride.id]);

  function publishLift() {
    const direction = Number(held.current.up !== null) - Number(held.current.down !== null);
    onLiftRef.current(direction as -1 | 0 | 1);
  }

  function holdLift(direction: LiftDirection, pointerId: number) {
    const key = direction === 1 ? 'up' : 'down';
    if (held.current[key] !== null) return;
    held.current[key] = pointerId;
    publishLift();
  }

  function releaseLift(direction: LiftDirection, pointerId?: number) {
    const key = direction === 1 ? 'up' : 'down';
    if (held.current[key] === null || (pointerId !== undefined && held.current[key] !== pointerId)) return;
    held.current[key] = null;
    publishLift();
  }

  function handlePointerHold(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    holdLift(event.currentTarget.value === '1' ? 1 : -1, event.pointerId);
  }

  function handlePointerRelease(event: PointerEvent<HTMLButtonElement>) {
    releaseLift(event.currentTarget.value === '1' ? 1 : -1, event.pointerId);
  }

  function handleKeyHold(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey || ![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    if (!event.repeat) holdLift(event.currentTarget.value === '1' ? 1 : -1, KEYBOARD_POINTER);
  }

  function handleKeyRelease(event: KeyboardEvent<HTMLButtonElement>) {
    if (![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    releaseLift(event.currentTarget.value === '1' ? 1 : -1, KEYBOARD_POINTER);
  }

  function handleBlur(event: FocusEvent<HTMLButtonElement>) {
    releaseLift(event.currentTarget.value === '1' ? 1 : -1);
  }

  return (
    <section
      className={styles.rideControls}
      data-flight={flying}
      data-autonomous={autonomous}
      aria-label={`${ride.name} riding controls`}
    >
      <div className={styles.identity}>
        <strong title={ride.name}>{ride.name}</strong>
        <div className={styles.metrics}>
          <span aria-label={`Speed ${speed}`}>
            <Gauge size={12} aria-hidden="true" />
            <span className={styles.metricLabel}>Speed</span>
            <b>{speed}</b>
          </span>
          {flying && (
            <span aria-label={`Height ${altitude}`}>
              <span className={styles.metricLabel}>Height</span>
              <b>{altitude}</b>
            </span>
          )}
        </div>
      </div>
      <div className={styles.actions}>
        {flying &&
          !autonomous &&
          [
            { direction: 1 as const, label: 'Ascend', shortcut: 'Space', Icon: ArrowUp },
            { direction: -1 as const, label: 'Descend', shortcut: 'C', Icon: ArrowDown },
          ].map(({ direction, label, shortcut, Icon }) => (
            <Button
              key={direction}
              overrideDefaults
              value={direction}
              className={`${styles.control} ${styles.lift}`}
              aria-label={`Hold to ${label.toLowerCase()}`}
              aria-keyshortcuts={shortcut}
              title={`Hold ${shortcut} or this button to ${label.toLowerCase()}`}
              onPointerDown={handlePointerHold}
              onPointerUp={handlePointerRelease}
              onPointerCancel={handlePointerRelease}
              onLostPointerCapture={handlePointerRelease}
              onKeyDown={handleKeyHold}
              onKeyUp={handleKeyRelease}
              onBlur={handleBlur}
            >
              <Icon size={17} aria-hidden="true" />
              <span className={styles.buttonLabel}>{label}</span>
              <kbd>{shortcut === 'Space' ? 'SPACE' : shortcut}</kbd>
            </Button>
          ))}
        <Button
          overrideDefaults
          className={styles.control}
          onClick={onStunt}
          disabled={ride.landing}
          aria-label="Perform a stunt"
          aria-keyshortcuts="F"
          title={autonomous ? 'F · Roll and breathe fire' : 'F · Stunt'}
        >
          <Sparkles size={17} aria-hidden="true" />
          <span className={styles.buttonLabel}>{autonomous ? 'Stunt + fire' : 'Stunt'}</span>
          <kbd>F</kbd>
        </Button>
        <Button
          overrideDefaults
          className={`${styles.control} ${styles.leave}`}
          onClick={onGetOff}
          disabled={getOffHint !== null}
          aria-label={autonomous ? 'Land and get off dragon' : `Get off ${ride.name}`}
          aria-keyshortcuts="E"
          aria-describedby={getOffHint ? hintId : undefined}
          title={getOffHint ?? (autonomous ? 'E · Land and get off' : 'E · Get off')}
        >
          <LogOut size={17} aria-hidden="true" />
          <span className={styles.buttonLabel}>{autonomous ? 'Land and get off' : 'Get off'}</span>
          <kbd>E</kbd>
        </Button>
      </div>
      <p className={styles.hint} id={hintId}>
        {getOffHint ? (
          getOffHint
        ) : autonomous ? (
          'Enjoy the flight · F to roll and breathe fire · E to land'
        ) : flying ? (
          'Hold to rise or descend'
        ) : (
          <>
            <kbd>SPACE</kbd> to hop · <kbd>SHIFT</kbd> to brake
          </>
        )}
        {ride.stunt && (
          <span className={styles.stunt} role="status">
            {ride.stunt.slice(0, 48)}
          </span>
        )}
      </p>
    </section>
  );
}
