'use client';

import { type FocusEvent, type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useRef } from 'react';
import { Flame, LogOut } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import styles from './WorldRideControls.module.css';

interface WorldToolControlsProps {
  firing: boolean;
  onFire: (firing: boolean) => void;
  onDrop: () => void;
}

type HeldFire = { kind: 'pointer'; id: number; element: HTMLButtonElement } | { kind: 'keyboard'; key: string };

const activationKey = (key: string) => (key === ' ' || key === 'Enter' ? key : key.toLowerCase() === 'b' ? 'b' : null);

function releaseHeldFire(
  held: RefObject<HeldFire | null>,
  fire: RefObject<WorldToolControlsProps['onFire']>,
  force = false,
) {
  const owner = held.current;
  if (!owner && !force) return;
  held.current = null;
  if (owner?.kind === 'pointer' && owner.element.hasPointerCapture?.(owner.id)) {
    owner.element.releasePointerCapture(owner.id);
  }
  fire.current(false);
}

export function WorldToolControls({ firing, onFire, onDrop }: WorldToolControlsProps) {
  const fire = useRef(onFire);
  const held = useRef<HeldFire | null>(null);
  useEffect(() => {
    fire.current = onFire;
  }, [onFire]);
  useEffect(() => {
    const reset = () => releaseHeldFire(held, fire, true);
    const hidden = () => {
      if (document.visibilityState === 'hidden') reset();
    };
    const pointerRelease = (event: globalThis.PointerEvent) => {
      if (held.current?.kind === 'pointer' && held.current.id === event.pointerId) releaseHeldFire(held, fire);
    };
    const keyRelease = (event: globalThis.KeyboardEvent) => {
      if (held.current?.kind === 'keyboard' && held.current.key === activationKey(event.key))
        releaseHeldFire(held, fire);
    };
    window.addEventListener('blur', reset);
    window.addEventListener('pointerup', pointerRelease);
    window.addEventListener('pointercancel', pointerRelease);
    window.addEventListener('keyup', keyRelease);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', reset);
      window.removeEventListener('pointerup', pointerRelease);
      window.removeEventListener('pointercancel', pointerRelease);
      window.removeEventListener('keyup', keyRelease);
      document.removeEventListener('visibilitychange', hidden);
      reset();
    };
  }, []);

  function handlePointerHold(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || held.current) return;
    event.preventDefault();
    held.current = { kind: 'pointer', id: event.pointerId, element: event.currentTarget };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    fire.current(true);
  }

  function handlePointerRelease(event: PointerEvent<HTMLButtonElement>) {
    if (held.current?.kind !== 'pointer' || held.current.id !== event.pointerId) return;
    releaseHeldFire(held, fire);
  }

  function handleKeyHold(event: KeyboardEvent<HTMLButtonElement>) {
    const key = activationKey(event.key);
    if (event.ctrlKey || event.metaKey || event.altKey || !key) return;
    event.preventDefault();
    if (event.repeat || held.current) return;
    held.current = { kind: 'keyboard', key };
    fire.current(true);
  }

  function handleKeyRelease(event: KeyboardEvent<HTMLButtonElement>) {
    const key = activationKey(event.key);
    if (!key) return;
    event.preventDefault();
    if (held.current?.kind !== 'keyboard' || held.current.key !== key) return;
    releaseHeldFire(held, fire);
  }

  function handleBlur(event: FocusEvent<HTMLButtonElement>) {
    if (event.target === event.currentTarget) releaseHeldFire(held, fire, true);
  }

  function handleDrop() {
    releaseHeldFire(held, fire, true);
    onDrop();
  }

  return (
    <section className={`${styles.rideControls} ${styles.weaponControls}`} aria-label="Flamethrower controls">
      <div className={styles.identity}>
        <strong>Flamethrower</strong>
      </div>
      <div className={styles.actions}>
        <Button
          overrideDefaults
          className={styles.control}
          data-firing={firing}
          aria-label="Hold to fire flamethrower"
          aria-keyshortcuts="B"
          onPointerDown={handlePointerHold}
          onPointerUp={handlePointerRelease}
          onPointerCancel={handlePointerRelease}
          onLostPointerCapture={handlePointerRelease}
          onKeyDown={handleKeyHold}
          onKeyUp={handleKeyRelease}
          onBlur={handleBlur}
        >
          <Flame size={18} aria-hidden="true" />
          <span className={styles.buttonLabel}>Hold fire</span>
          <kbd>B</kbd>
        </Button>
        <Button
          overrideDefaults
          className={styles.control}
          aria-label="Drop flamethrower"
          aria-keyshortcuts="E"
          onClick={handleDrop}
        >
          <LogOut size={17} aria-hidden="true" />
          <span className={styles.buttonLabel}>Drop</span>
          <kbd>E</kbd>
        </Button>
      </div>
      <p className={styles.hint}>Drag to aim · Hold mouse or B to burn · Refresh to restore the world</p>
    </section>
  );
}
