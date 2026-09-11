import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldToolControls } from './WorldToolControls';

function pointer(target: HTMLElement | Window, type: string, pointerId: number, button = 0) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: pointerId }, button: { value: button } });
  fireEvent(target, event);
}

function capture(button: HTMLElement) {
  const held = new Set<number>();
  const set = vi.fn((id: number) => {
    held.add(id);
  });
  const release = vi.fn((id: number) => {
    held.delete(id);
  });
  Object.defineProperties(button, {
    setPointerCapture: { configurable: true, value: set },
    hasPointerCapture: { configurable: true, value: (id: number) => held.has(id) },
    releasePointerCapture: { configurable: true, value: release },
  });
  return { set, release };
}

function setup() {
  const onFire = vi.fn<(firing: boolean) => void>();
  const onDrop = vi.fn<() => void>();
  const view = render(<WorldToolControls firing={false} onFire={onFire} onDrop={onDrop} />);
  const fire = screen.getByRole('button', { name: 'Hold to fire flamethrower' });
  const captures = capture(fire);
  return { ...view, fire, captures, onFire, onDrop };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('flamethrower held controls', () => {
  it('shows the controlled firing state and advertises the existing world shortcuts', () => {
    const { fire, onFire, onDrop, rerender } = setup();
    expect(screen.getByRole('region', { name: 'Flamethrower controls' })).toBeInTheDocument();
    expect(fire).toHaveAttribute('aria-keyshortcuts', 'B');
    expect(fire).toHaveAttribute('data-firing', 'false');
    expect(screen.getByRole('button', { name: 'Drop flamethrower' })).toHaveAttribute('aria-keyshortcuts', 'E');
    rerender(<WorldToolControls firing onFire={onFire} onDrop={onDrop} />);
    expect(fire).toHaveAttribute('data-firing', 'true');
    fireEvent.click(fire);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('keeps ownership of the first pointer and ignores unrelated pointer and keyboard releases', () => {
    const { fire, captures, onFire } = setup();
    pointer(fire, 'pointerdown', 11);
    pointer(fire, 'pointerdown', 22);
    pointer(fire, 'pointerup', 22);
    pointer(fire, 'pointercancel', 22);
    pointer(fire, 'lostpointercapture', 22);
    fireEvent.keyUp(fire, { key: ' ' });
    expect(onFire.mock.calls).toEqual([[true]]);
    expect(captures.set.mock.calls).toEqual([[11]]);
    pointer(window, 'pointerup', 11);
    expect(onFire.mock.calls).toEqual([[true], [false]]);
    expect(captures.release.mock.calls).toEqual([[11]]);
    pointer(fire, 'lostpointercapture', 11);
    expect(onFire.mock.calls).toEqual([[true], [false]]);
  });

  it.each(['pointercancel', 'lostpointercapture'])('releases fire when its owning pointer receives %s', (event) => {
    const { fire, onFire } = setup();
    pointer(fire, 'pointerdown', 4);
    pointer(fire, event, 4);
    expect(onFire.mock.calls).toEqual([[true], [false]]);
    pointer(window, 'pointerup', 4);
    expect(onFire.mock.calls).toEqual([[true], [false]]);
  });

  it('ignores non-primary mouse buttons and releases outside the button when pointer capture is unavailable', () => {
    const onFire = vi.fn();
    render(<WorldToolControls firing={false} onFire={onFire} onDrop={vi.fn()} />);
    const fire = screen.getByRole('button', { name: 'Hold to fire flamethrower' });
    pointer(fire, 'pointerdown', 9, 2);
    pointer(window, 'pointerup', 9, 2);
    expect(onFire).not.toHaveBeenCalled();
    pointer(fire, 'pointerdown', 10);
    pointer(window, 'pointercancel', 10);
    expect(onFire.mock.calls).toEqual([[true], [false]]);
  });

  it('ignores key repeats and modifiers and requires release of the key that started the hold', () => {
    const { fire, onFire, captures } = setup();
    fireEvent.keyDown(fire, { key: ' ', repeat: true });
    fireEvent.keyDown(fire, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(fire, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(fire, { key: 'Enter', altKey: true });
    expect(onFire).not.toHaveBeenCalled();
    fireEvent.keyDown(fire, { key: ' ' });
    fireEvent.keyDown(fire, { key: ' ', repeat: true });
    fireEvent.keyDown(fire, { key: 'Enter' });
    fireEvent.keyUp(fire, { key: 'Enter' });
    pointer(fire, 'pointerdown', 7);
    pointer(window, 'pointerup', 7);
    expect(captures.set).not.toHaveBeenCalled();
    expect(onFire.mock.calls).toEqual([[true]]);
    fireEvent.keyUp(window, { key: ' ' });
    expect(onFire.mock.calls).toEqual([[true], [false]]);
    fireEvent.keyDown(fire, { key: 'Enter' });
    fireEvent.keyUp(fire, { key: 'Enter' });
    expect(onFire.mock.calls).toEqual([[true], [false], [true], [false]]);
    fireEvent.keyDown(fire, { key: 'b' });
    fireEvent.keyDown(fire, { key: 'B', repeat: true });
    fireEvent.keyUp(fire, { key: 'B' });
    expect(onFire.mock.calls).toEqual([[true], [false], [true], [false], [true], [false]]);
  });

  it.each(['button blur', 'window blur', 'hidden document'])(
    'clears a held pointer on %s and allows a fresh press afterward',
    (reason) => {
      const { fire, onFire } = setup();
      pointer(fire, 'pointerdown', 1);
      if (reason === 'button blur') fireEvent.blur(fire);
      else if (reason === 'window blur') fireEvent(window, new Event('blur'));
      else {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        fireEvent(document, new Event('visibilitychange'));
      }
      expect(onFire.mock.calls).toEqual([[true], [false]]);
      pointer(window, 'pointerup', 1);
      expect(onFire.mock.calls).toEqual([[true], [false]]);
      pointer(fire, 'pointerdown', 2);
      pointer(fire, 'pointerup', 2);
      expect(onFire.mock.calls).toEqual([[true], [false], [true], [false]]);
    },
  );

  it('keeps a hold when a visibility event reports that the document is still visible', () => {
    const { fire, onFire } = setup();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    pointer(fire, 'pointerdown', 1);
    fireEvent(document, new Event('visibilitychange'));
    expect(onFire.mock.calls).toEqual([[true]]);
  });

  it('uses the latest fire callback and removes global release listeners when unmounted', () => {
    const { fire, onFire, onDrop, rerender, unmount } = setup();
    const latest = vi.fn();
    pointer(fire, 'pointerdown', 2);
    rerender(<WorldToolControls firing onFire={latest} onDrop={onDrop} />);
    fireEvent(window, new Event('blur'));
    expect(onFire.mock.calls).toEqual([[true]]);
    expect(latest.mock.calls).toEqual([[false]]);
    pointer(fire, 'pointerdown', 3);
    unmount();
    expect(latest.mock.calls).toEqual([[false], [true], [false]]);
    latest.mockClear();
    pointer(window, 'pointerup', 3);
    fireEvent(window, new Event('blur'));
    fireEvent.keyUp(window, { key: ' ' });
    fireEvent(document, new Event('visibilitychange'));
    expect(latest).not.toHaveBeenCalled();
  });

  it('stops fire before invoking the drop action', () => {
    const actions: string[] = [];
    render(
      <WorldToolControls
        firing
        onFire={(value) => actions.push(`fire:${value}`)}
        onDrop={() => actions.push('drop')}
      />,
    );
    const fire = screen.getByRole('button', { name: 'Hold to fire flamethrower' });
    capture(fire);
    pointer(fire, 'pointerdown', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Drop flamethrower' }));
    expect(actions).toEqual(['fire:true', 'fire:false', 'drop']);
    pointer(window, 'pointerup', 1);
    expect(actions).toEqual(['fire:true', 'fire:false', 'drop']);
  });
});
