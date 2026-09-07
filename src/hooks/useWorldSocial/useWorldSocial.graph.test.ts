import { describe, expect, it } from 'vitest';
import { type WorldFollowingPage, WorldSocialGraph } from './useWorldSocial.graph';

const key = (value: number) => value.toString(36).padStart(52, 'a');
const VIEWER = key(0);
const ALICE = key(1);
const BOB = key(2);
const CAROL = key(3);

function page(graph: WorldSocialGraph, ids: string[], exhausted = true, skip?: number) {
  const request = graph.takePages(1)[0];
  expect(request).toBeDefined();
  expect(graph.acceptPage(request, { nextPageIds: ids, skip, isExhausted: exhausted })).toBe(true);
  return request;
}

describe('WorldSocialGraph', () => {
  it('keeps every direct ID across cached partial pages without treating undefined skip as exhaustion', () => {
    const graph = new WorldSocialGraph(VIEWER);
    const ids = Array.from({ length: 57 }, (_, index) => key(index + 1));
    expect(page(graph, ids.slice(0, 20), false).skip).toBe(0);
    expect(page(graph, ids.slice(20, 40), false).skip).toBe(20);
    expect(page(graph, ids.slice(40), true).skip).toBe(40);
    expect(graph.directComplete).toBe(true);
    expect(graph.complete).toBe(false);
    const snapshot = graph.snapshot(null);
    expect(snapshot.people.map((person) => person.id)).toEqual(ids);
    expect(snapshot.directCount).toBe(57);
    expect(snapshot.people.every((person) => person.degree === 1 && person.profileLoaded === false)).toBe(true);
    expect(snapshot.relationships).toHaveLength(57);
    expect(snapshot.relationships.every((edge) => edge.from === VIEWER && edge.label === 'follows')).toBe(true);
  });

  it('keeps real two-hop provenance, dedupes cycles, and never schedules a third hop', () => {
    const graph = new WorldSocialGraph(VIEWER);
    page(graph, [ALICE, BOB]);
    page(graph, [VIEWER, BOB, CAROL]);
    page(graph, [CAROL, ALICE]);
    expect(graph.complete).toBe(true);
    expect(graph.takePages(2)).toEqual([]);
    const snapshot = graph.snapshot(null);
    expect(snapshot.people.map((person) => person.id)).toEqual([ALICE, BOB, CAROL]);
    expect(snapshot.people.find((person) => person.id === CAROL)).toMatchObject({ degree: 2, parentIds: [ALICE, BOB] });
    expect(snapshot.discoveryCount).toBe(1);
    expect(snapshot.people.some((person) => person.id === VIEWER)).toBe(false);
    expect(snapshot.relationships).toContainEqual({ from: ALICE, to: VIEWER, label: 'follows' });
  });

  it('shrinks the selected unfollowed marker and removes discoveries whose only parent was removed', () => {
    const graph = new WorldSocialGraph(VIEWER);
    page(graph, [ALICE, BOB]);
    page(graph, [CAROL]);
    page(graph, []);
    graph.applyLocalFollow(ALICE, false);
    const snapshot = graph.snapshot(ALICE);
    expect(snapshot.people.map((person) => person.id)).toEqual([BOB, ALICE]);
    expect(snapshot.people.find((person) => person.id === ALICE)).toMatchObject({ degree: 2, parentIds: [] });
    expect(snapshot.relationships).toEqual([{ from: VIEWER, to: BOB, label: 'follows' }]);
    expect(snapshot.directCount).toBe(1);
    expect(snapshot.discoveryCount).toBe(0);
    expect(graph.snapshot(null).people.map((person) => person.id)).toEqual([BOB]);
  });

  it('enqueues a newly followed person and resumes a person removed while their work was queued', () => {
    const graph = new WorldSocialGraph(VIEWER);
    page(graph, [ALICE]);
    graph.applyLocalFollow(ALICE, false);
    expect(graph.takePages(2)).toEqual([]);
    graph.applyLocalFollow(ALICE, true);
    page(graph, [BOB]);
    graph.applyLocalFollow(BOB, true);
    expect(graph.snapshot(null).people.find((person) => person.id === BOB)?.degree).toBe(1);
    page(graph, [CAROL]);
    expect(graph.snapshot(null).people.find((person) => person.id === CAROL)?.parentIds).toEqual([BOB]);
  });

  it('returns stable graph arrays through status changes and selection of already visible people', () => {
    const graph = new WorldSocialGraph(VIEWER);
    page(graph, [ALICE, BOB]);
    const snapshot = graph.snapshot(null);
    expect(graph.snapshot(ALICE).people).toBe(snapshot.people);
    expect(graph.snapshot(BOB).relationships).toBe(snapshot.relationships);
    page(graph, []);
    expect(graph.snapshot(null).people).toBe(snapshot.people);
  });

  it.each([
    { nextPageIds: undefined, skip: undefined, isExhausted: false },
    { nextPageIds: ['not-a-public-key'], skip: 1, isExhausted: true },
    { nextPageIds: Array.from({ length: 21 }, (_, index) => key(index + 1)), skip: 21, isExhausted: true },
    { nextPageIds: [ALICE], skip: 0, isExhausted: false },
    { nextPageIds: [], skip: 20, isExhausted: false },
  ])('rejects malformed or non-progressing pages without accepting IDs: %j', (malformed) => {
    const graph = new WorldSocialGraph(VIEWER);
    const request = graph.takePages(1)[0];
    expect(graph.acceptPage(request, malformed as WorldFollowingPage)).toBe(false);
    expect(graph.snapshot(null).people).toEqual([]);
    expect(graph.takePages(1)).toEqual([]);
    graph.retryFailed();
    expect(graph.takePages(1)).toEqual([request]);
  });

  it('halts a repeated page stream even if its numeric cursor keeps advancing', () => {
    const graph = new WorldSocialGraph(VIEWER);
    page(graph, [ALICE], false, 1);
    page(graph, [ALICE], false, 2);
    const request = graph.takePages(1)[0];
    expect(graph.acceptPage(request, { nextPageIds: [ALICE], skip: 3, isExhausted: false })).toBe(false);
    expect(graph.snapshot(null).directCount).toBe(1);
    expect(graph.complete).toBe(false);
  });
});
