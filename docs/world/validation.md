# Pubky World validation record

## Dark-world increment — 2026-09-07

The current world uses Pubky's near-black/graphite/acid-lime palette, adds a
Lugano-inspired Satoshi monument, a Trending Theater, and the Brrr Bank. The
Classic Pubky link opens `https://pubky.app/` with opener protection.

| Current focused check                               | Result                 |
| --------------------------------------------------- | ---------------------- |
| World interface                                     | 9 passed               |
| Camera interface                                    | 4 passed               |
| Public staging data and ranked Hot feed             | 21 passed              |
| Movement and collision                              | 5 passed               |
| Theater timing, pause, order and text rendering     | 5 passed               |
| Individual bank bill lifecycles                     | 3 passed               |
| Total in the latest focused run                     | **47 passed**          |
| Focused TypeScript, including imported dependencies | Passed                 |
| ESLint for changed source                           | Passed                 |
| Source and build-workflow security gate             | No actionable findings |

The data-boundary checks use Pubky's existing `total_engagement:all:all` Hot
stream. Eight ranked public IDs and their eight detail requests returned HTTP 200.
The program has no date-window filter. Invalid or missing records are excluded;
a failed staging program stays empty instead of displaying fictional posts.

The browser verified the dark desktop scene, the theater's next/resume/pause
controls and timed advancement while its reading dialog pauses player movement.
Travel now arrives in the theater's central aisle and reports the theater zone.
A dark 1270×800 camera PNG downloaded successfully with the HUD excluded.
The statue's seated hooded silhouette and separated steel contours were inspected
close up. Two bank frames showed bills moving and evaporating independently while
other bills remained visible. No JavaScript errors were observed in this pass.
The final 390×844 mobile layout has readable short destination labels, no
horizontal overflow, and unobstructed data-source and camera controls. The
bundled Bitkit SVG returned HTTP 200 and its extrusion was checked in the dark scene.

Current evidence: [overview](./screenshots/overview.png),
[theater](./screenshots/theater.png), [theater reader](./screenshots/theater-dialog.png),
[Satoshi](./screenshots/satoshi.png), [bank](./screenshots/bank.png),
[later bank frame](./screenshots/bank-next.png), and [mobile](./screenshots/mobile.png).

A prepared local build-workflow change can package a manual, exact-SHA standalone
runtime after checking the root and `/sign-in` routes against staging. Its YAML, shell syntax,
archive exclusions and unsafe-link fixtures passed. The local machine's memory
limit still prevents a full Next build. The workflow change has not been
published because GitHub requires the CLI login's additional `workflow`
permission. The app changes are pushed separately. The running preview remains
the visual harness described below, with authentication and posting unavailable there.

## Earlier baseline

Recorded 2026-09-07. This is an incremental local preview, with no public deployment
or registry PR. The world and camera browser checks passed.

### Automated checks

| Check                                                             | Result                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| Route helpers and route guard, including exact public-root access | 86 passed                                              |
| Movement and collision tests                                      | 5 passed                                               |
| World interface, camera, photo hook and existing post composer    | 112 passed                                             |
| World data hook tests                                             | 14 passed                                              |
| Total unique targeted tests across runs                           | **217 passed**                                         |
| ESLint for changed source                                         | Passed again after the final source changes            |
| Full repository TypeScript                                        | Passed during implementation                           |
| Focused world TypeScript after camera implementation              | Passed, including imported dependencies and test setup |
| Root-only production build, including full TypeScript             | Passed                                                 |
| Full application production build                                 | **Not completed: shared-host memory limits**           |

The successful production build contained only `/` and `/_not-found`, including
their inherited layouts and providers. It preceded the last visual and control
fixes. It is partial validation and must not be reported as a successful full
application build.

Full builds encountered host `SIGKILL` termination and an explicit 1536 MiB V8 heap
limit. Separating compiler workers allowed the root-only build to finish. No
source compilation error preceded those memory failures. Later full development,
updated root-only and lighter isolated Next builds also received host termination
as available memory declined. There is no current completed Next build artifact.
Build and preview work must run sequentially because they share `.next` and compete
for host memory. The host used Node 22.23.2; the repository recommends Node 24.

### Public staging data

Browser verification loaded six tag trees, 20 real post leaves and six public
profiles. Leaf membership was checked against the post's actual tag metadata.

The browser exposed a following-stream integration defect: `limit=24` returned
HTTP 400 with `limit exceeds maximum of 20`. The hook now uses 20. Direct checks
of all six following requests returned HTTP 200 and confirmed four follow edges
among the displayed people. The regression test exercises the real Nexus service,
stream-ID conversion and URL builder, simulating only the HTTP boundary.

### Browser and security review

Earlier browser checks passed walking, district travel, the arena, dialog movement
pausing, actual 3D leaf picking, mobile movement and links. Fog, mobile overlap and
the following-request limit were corrected after that pass.

- [x] Final visual browser recheck after those fixes: visibility, mobile overlap,
      overview exit state, sustained click-to-walk and the Bitkit extrusion.
- [x] Capture desktop, walking, mobile and Bitkit screenshots for the checkpoint.
- [x] Check a real camera PNG, review/download, resumed movement and mobile controls.

The desktop capture was a valid 1270×800 PNG (311,272 bytes); the mobile capture
was 380×844. Both were nonblank and excluded the HUD. A second photo after walking
had a new object URL and different image bytes. Closing the preview restored
canvas focus and movement. Mobile controls remained reachable with no horizontal
page or dialog overflow. No JavaScript exceptions or HTTP errors were observed.
Publishing was visibly disabled in the demo harness; no actual post was published.

Review evidence: [island](./screenshots/overview.png),
[mobile](./screenshots/mobile.png), [Bitkit](./screenshots/bitkit.png),
[downloaded camera PNG](./screenshots/photo.png),
[photo review dialog](./screenshots/photo-dialog.png).

The camera/composer tests cover explicit handoff, temporary URL cleanup, failed
encoding, stale completion, one capture at a time, MIME/size/config validation,
account changes, guest authentication, draft discard and attachment prefill. A
Strict Mode regression test ensures the seeded photo is attached only once.

World, DialogNewPost and PostInput have no sibling VRT baseline. The world
screenshots form the initial visual checkpoint; a dedicated VRT baseline can be
added once the visual direction is accepted.

The source-focused security gate found no actionable issue in the world changes.
Inherited dependency advisories remain documented in [README.md](./README.md);
this result does not clear the entire upstream dependency tree.

## Local preview scope

The final visual checkpoint uses a temporary Vite harness outside the repository,
at `/home/gaib/.cache/pubky-world-visual`. It renders the actual `World.tsx`, Three.js
engine, landmarks, styles and UI atoms. Its data-hook adapter supplies the example
neighborhood, its photo-posting adapter disables publishing, and Next links become
plain anchors. The staging button and photo panel explain the full-application
requirement. It does not simulate successful staging requests or supply fabricated
records labelled as real data.

This harness can validate the latest world appearance and controls. It cannot
validate the inherited Next layouts, authentication, live loader integration,
classic feed, profile or post routes. Staging evidence above comes from the earlier
real Next preview and subsequent API-boundary checks, not this visual harness.

Use the normal commands in [README.md](./README.md) on a machine with sufficient
free memory to run the full application. No preview adapter or reduced-validation
configuration is part of the production source.
