# Pubky World validation record

## Complete chessboard and enlarged cinema — 2026-09-08

Open PRs were checked in the fork and upstream before this increment; none
addressed the chessboard or these labels. The user made the repository public;
the GitHub API confirmed `its-gaib/pubky-3d` is public, and fork metadata now agrees.

The floating CHECKMATE CITADEL and "18 films · one more?" labels are removed.
The chessboard's apparent circular hole was an overlapping district-ground disk:
its top sat at 0.12, above the checker tiles at 0.0775. Chess now uses its own
square foundation without that generic disk. The other districts keep their
existing ground, and the complete armies, walking gaps and Chessky link remain.

Midnight Cinema's architecture and live screen are doubled together. The screen
is 36×20.25, with its frame in world units so the DOM projection does not receive
the building's scale twice. The building, collision footprints and entrance
approach scale consistently. The walkable radius grows from 142 to 160, leaving
a walkable margin around the rotated building. The footprint also reserves more
space from decorative trees, Bitkit and the nearby portal. The movie program
and iframe permissions are unchanged.

The chess regression first failed with the old overlapping disk, then passed
after the exclusion was restored. Rays through all 64 tile centers now reach the
checker surface, and control cases preserve ordinary district and plaza ground.
All **34 focused tests passed across seven files**, including cinema geometry,
actual CSS projection dimensions, collision/arrival alignment, map clearance,
planets and jellyfish bounds. Formatting, ESLint and whitespace checks passed.
The final security gate reported no actionable findings. The complete runtime
build and browser check are the next checkpoint.

The complete build at `c413d901c0bfedce4a12e3bf54f332d5b8df4492` passed in
[run 34214487086](https://github.com/its-gaib/pubky-3d/actions/runs/34214487086):
webpack compilation, full TypeScript, all eight static pages, standalone packaging
and production startup. The smoke check confirmed all nine production runtime
values and root/sign-in readiness. Artifact `10051313175` is about 62 MiB; its
source, repository, branch, workflow and run metadata matched exactly, and it
was verified unexpired before download.

The fresh runtime returned HTTP 200 for `/` and `/sign-in` on isolated port 4323,
with all nine production values matching. The actual 640×480 browser check reached
an enabled Camera button, a WebGL canvas and two animation frames; guest entry
dismissed the welcome. No JavaScript, console or shader errors were recorded.
The optional normal-input approach to chess did not reach its target within
14.5 seconds, and the six-second screenshot attempt timed out. The overall timer
fired during cleanup; the browser closed normally after 45.8 seconds. This pass
produced no new board image. The source-level geometry and CSS projection checks
above remain the direct evidence for the repaired board and enlarged screen.
Results and logs are `world-chess-label-mini-results.json` and
`world-chess-label-mini-run.log` in `/home/gaib/.cache/pubky-3d-browser/`.

The new source now serves `127.0.0.1:4321`. Root and sign-in both returned 200 after
replacement, with the complete production tuple confirmed again. The temporary
4323 server and browser are closed; the earlier runtime remains on disk for
rollback. Later documentation-only commits do not change the serving source.

## World sign-in, conference deck and arena duel — 2026-09-08

The welcome screen prioritizes signing in to Pubky World, with guest exploration
as a secondary action. The existing route guard returns fully authenticated
sessions to `/` and preserves required profile creation. A one-use, account-free
navigation hint starts walking after restoration; it does not authenticate anyone.
Account creation links to the exact official `https://pubky.app/` URL without
identity parameters. The network badge and Classic Pubky header link are removed.

The northern conference deck contains three independently selectable miniature
destinations, with dates verified on the official event sites on September 8:
[DARK Prague](https://dark.events/events/prague/), October 2–4, 2026;
[Plan ₿ Lugano](https://planb.lugano.ch/planb-forum/), October 23–24, 2026; and
[Plan ₿ El Salvador](https://planb.sv/), January 29–30, 2027. Pubky's attendance
is the developer's stated plan. The cards link to the supplied official sites;
there is no booking, authentication or account handoff.

Two small local gladiators perform a repeating 12-second sword-and-shield duel
inside the Roman arena. Six focused arena tests pass, covering existing scenery,
bounded choreography, deterministic replay and stable geometry/material resources.
The scene's existing pause and reduced-motion gates also stop their animation.

The initial full build at `7aa63b3798f7274007185ff43f61510d27b36760` in
[run 34208598761](https://github.com/its-gaib/pubky-3d/actions/runs/34208598761)
compiled successfully with webpack, then exposed a TypeScript tuple-spread error
in portal placement. The call now passes its two coordinates explicitly; the
graph sculpture uses an explicit three-coordinate tuple as well. A new full
build and browser check follow this increment's source checks.

Focused validation for this checkpoint: **244 tests passed across 14 files**:
217 auth, routing and world-interface cases, 21 conference/layout/portal cases,
and six arena cases. The final security review reported no actionable findings
in the authentication changes or new scene resources. Formatting, ESLint and
whitespace checks passed before committing.

The follow-up removes floating name labels from the arena, Bitkit, all three
portals, Satoshi and Tether. The old "Probably a portal" label belonged to the
previous preview; the new three-portal renderer also omits its gateway names.
Nearby interactions, linked readers, monument geometry and physical plaques stay
available. Open PRs were checked again in the fork and upstream before this change.

The final source `5612962d63e3822fb944b91b0365be3cb5c411a9` passed the complete
Next.js production build, TypeScript, standalone packaging and production smoke
check in [run 34211327328](https://github.com/its-gaib/pubky-3d/actions/runs/34211327328).
The smoke check verifies all nine injected network values and HTTP 200 for both
`/` and `/sign-in`. Artifact `10050102814` matches that exact source, branch,
repository and manually dispatched workflow. It is about 62 MiB and was verified
as unexpired before retrieval. The targeted review of the label deletions found
no security concerns.

The actual 640×480 browser check passed and closed normally after 31 seconds.
The internal primary sign-in link and secondary guest action were visible; the
network badge and Classic link were absent. Native DOM activation entered guest
mode, focused the canvas, and an actual W-key press moved the persona. The scene,
Camera button and animation frames were ready, with no JavaScript, console or
shader errors. All 32 completed Nexus responses were production HTTP 200s, with
zero staging requests or requests for the deliberately fake legacy account.
The old auth record and `franky` database sentinel remained untouched, while new
production storage started signed out. No real account or publication was used.

The ambient cinema iframe was present before any cinema interaction and used the
fixed whitelist with muted autoplay. Playback was directly observed: video
`readyState` was 4, `paused` was false and `currentTime` advanced. Its overlay did
not capture controls. Navigating to sign-in removed the world and iframe, showed
the Pubky World sign-in heading and linked account creation to the official site.
The screenshot was captured and inspected. At this short viewport, the plaza's
social hint partly overlaps the persona's upper body; keyboard movement and
controls still work. Evidence is in `/home/gaib/.cache/pubky-3d-browser/`:
`world-production-mini-results.json`, `world-production-mini-run.log` and
`world-production-walking-mini.png`.

The verified runtime now serves `127.0.0.1:4321`. Both `/` and `/sign-in` returned
200 after replacement, and all nine injected production values matched again.
The temporary 4323 server and browser were closed. Earlier runtimes remain on disk
for rollback; later documentation-only commits do not change the serving source.

## Production network and cosmic districts — 2026-09-08

The fork had no open PRs before this increment, and the upstream open PR list did
not contain these world changes. The existing branch was clean and already pushed
at `b801ac9b6b4ec4ce222d387d4c79071251b9324a`.

All nine production network values were checked against the runtime configuration
served by `https://pubky.app/`. Dev/start commands now set that complete tuple;
world data, graph actions and photo drafts share its fail-closed guard. Network
namespaces separate all persisted stores, IndexedDB, mute cursors and tag markers;
the production shared-file handoff also uses a fresh cache. Legacy staging state
is left untouched and never restored. A full reload begins a fresh production
sign-in. Account publication remains explicit; automated tests mock that boundary.

The island grows from radius 112 to 142 (about 61% more walkable area). Midnight
Cinema and Trending Theater now sit 143 units apart and face different directions.
The cinema has an 18×10.125 screen with one persistent, muted native YouTube iframe,
using the original 18-video whitelist. It follows the world camera without reloads.
Conservative sampled occlusion hides the complete overlay behind scenery; this
does not share WebGL's depth buffer. Browser autoplay policy and video availability
can interrupt playback. The reader retains manual controls. Photos retain the
screen's local projector art instead of third-party video pixels.

Seven procedural planets vary in appearance, rings and near/far depth. Fourteen
of 24 jellyfish occupy a farther band and ten retain their near envelope; most sky
objects sit lower around the horizon. Walking camera pitch is lowered accordingly.
The bank uses 300 recycled instanced bills with the previous 70-second flight/landing
cycle, providing ten times the emission rate, and the BRRR sign vibrates at three
times its previous frequency. Three walk-through portals randomly choose another
exit, with clearance, cooldown and an immediate camera transfer.

The new giant chessboard, graph sculpture, arena and @halfin runner open the four
requested experiments through plain HTTPS links without identity parameters.
The runner's reader explains readable autocomplete pills and single-keystroke
removal. All world presence figures remain decorative or profile markers.

Focused verification: **266 unique tests passed across 24 files**, including the
production guard, storage namespaces, public loading, account/selection fences,
photo drafting, actual auth/settings stores, database initialization, mute/tag
storage, links, layout, cinema visibility and geometry, sky resources, money and
portal behavior. Five initial failures were stale network test fixtures; corrected
fixtures passed without weakening production code. Formatting, ESLint and whitespace
checks passed. The final source security gate reported no actionable findings.
Two camera integration findings were corrected before committing. Full production
build and actual browser verification are the next checkpoint.

This template has no sibling visual regression baseline. A dedicated screenshot
baseline remains an optional future addition; the browser checks below record
the actual rendering evidence and its limits.

## Galactic jellyfish — 2026-09-07

Open PRs were checked in the fork and upstream before this increment; none
addressed galactic jellyfish or this world surface.

Twenty-four jellyfish share four instanced draws beyond the island. Their colors,
scales, heights and 3D swimming velocities vary. A fixed envelope derived from the
coast controls their lifecycle; no camera direction, frustum or zoom value enters
spawning or recycling. The full animated body clears the island and the ocean.
Outer-boundary fades hide recycling; replacement jellyfish swim inward from the
edge. The motion clock uses bounded elapsed steps and freezes for paused or
reduced-motion viewing. Additive materials remain visible beyond the island's
fog and respect depth testing; they cast no shadows and load no external assets.
The scene explicitly releases their instance resources during teardown.

All eight focused tests passed: repeated generations, long 3D swimming runs,
full-body boundary exit, fade behavior, paused/reduced motion, animated geometry
clearance, fixed instance resources during recycling, and idempotent disposal.
ESLint and formatting passed. Source and resource review found no remaining issues.
The complete production build and TypeScript passed at
`971f972e79ed74e5e0617df6af859460b5849522` in
[run 34168589341](https://github.com/its-gaib/pubky-3d/actions/runs/34168589341).
Standalone packaging and staging smoke passed. Artifact `10035040786` matches the
verified source/repository/workflow metadata and is about 62 MiB. The bounded
extraction helper produced a fresh runtime; `/` and `/sign-in` both returned 200
on its isolated loopback server.

The actual 640×480 browser check passed scene readiness and two animation frames,
with visible jellyfish, no JavaScript exceptions, and no console errors (including
shader errors). All 35 completed Nexus responses returned 200. The browser closed
normally after 11 seconds. The image confirms rendering but also exposed touch
controls overlapping the welcome action in short windows. The controls now stay
hidden until the existing Let's wander action dismisses the welcome panel.
Local evidence: `world-jellyfish-mini-results.json` and
`world-jellyfish-desktop-mini.png` in `/home/gaib/.cache/pubky-3d-browser/`.

The final source `3a3ebd2f7665905cdcb1054fb77a32015ad1b658` passed the full
production build, TypeScript, standalone packaging and staging smoke in
[run 34169312975](https://github.com/its-gaib/pubky-3d/actions/runs/34169312975).
Artifact `10035253762` matches the source, repository and manual workflow. Its
fresh runtime passed another actual 640×480 browser check: scene and Camera ready,
two animation frames, no fallback, no JavaScript exceptions or console/shader
errors, and 35 completed Nexus responses all returning 200. The actual welcome
button handler was invoked with a native DOM click; movement controls had no
client rectangles during welcome and became visible after dismissal. The browser
closed after 12.4 seconds. The optional screenshot timed out, so the earlier
jellyfish image remains the visual evidence. Results are in
`/home/gaib/.cache/pubky-3d-browser/world-welcome-controls-mini-results.json`.

The verified final runtime serves `127.0.0.1:4321`; `/` and `/sign-in` both returned
200 after replacement. The temporary server was stopped. Earlier runtimes remain
on disk for rollback. Later documentation-only commits do not change this runtime.

## Social plaza, cinema and Roman arena — 2026-09-07

This increment always uses staging. The source switch and global destination menu
are removed; walking and nearby interactions reveal the world. The pocket map is
informational. The bank's contextual Hard Money action beams the persona in front
of the Bitkit beacon and deliberately frames the logo.

The fork had no open PRs before implementation. Relevant upstream work was read:
[graph explorer #2138](https://github.com/pubky/pubky-app/pull/2138),
[follow synchronization #2474](https://github.com/pubky/pubky-app/pull/2474), and
[social status #2471](https://github.com/pubky/pubky-app/pull/2471). These do not
implement this world. The graph explorer needs an experimental API; the broader
cross-device reconciliation subsystem is not duplicated by this UI.

The personal plaza paginates the viewer's full following stream and exactly one
further hop. It keeps every discovered key, with placeholders and lazy profile
hydration. Direct follows stand tall; discoveries are smaller and quieter. Large
circles use eight spatial neighborhoods and windows of at most 96 figures, while
the directory pages through every discovered key in groups of 20. Reads use two
concurrent slots and explicit continuation after 100 pages; a paused or incomplete
graph is labelled rather than presented as complete. Names become searchable as
profiles load; public keys are searchable immediately.

Follow and unfollow reuse the existing signed publication path. The world records
local intent immediately, fences results to the current account/selection, prevents
same-tick double submissions, and offers an explicit retry of the same intent if
publication fails. Tests mock the publication boundary; no real account was used
to follow, unfollow or publish. Broad cross-device reconciliation remains the
upstream concern linked above. A person panel shows a canonical avatar and latest
post, without a connections list.

The walkable radius grows from 76 to 112 (about 117% more area). New grounds hold
a distinct crimson Art Deco cinema beside the open-air Trending Theater, a Tether
monument, and a larger Roman amphitheater. The arena alternates the exact local
Pubky and Synonym symbol paths on its banners, without wordmarks. The Tether
monument uses the bundled official wordmark and links to Ventures. The cinema
uses all 18 requested video IDs in a shuffled native YouTube playlist; it loads
only after Start screening. The iframe's load event does not prove that a video
is playable. Native player controls and explicit reshuffling remain available;
closing the reader removes the player.

Eight decorative visitors sit in the Trending Theater. The main persona wears a
black Pubky hoodie without a backpack. The bank has one vibrating facade BRRR
sign and 30 recycled bills with staggered 70-second lives; some land before fading.
Reduced motion stops the sign shake and world animations. The Satoshi reader
keeps the Lugano monument story and also links to satsymbol.org.

| Check                                        | Result                   |
| -------------------------------------------- | ------------------------ |
| Interface, staging data and cinema program   | 43 passed                |
| Social hook, graph and queue                 | 37 passed                |
| Renderer, camera and photo flow              | 70 passed                |
| Total unique focused tests                   | **150 passed**           |
| ESLint, formatting and whitespace            | Passed                   |
| Final source security review                 | No remaining findings    |
| Full Next.js production build and TypeScript | Passed in CI             |
| Standalone staging `/` and `/sign-in` smoke  | Passed in CI and locally |

Full and focused local TypeScript processes were killed by host memory pressure
(exit 137, no compiler diagnostics). The complete remote build then passed at
`2b771c4868f7da3603a152b8cc5699c7276ec3f6`:
[build 34166507424](https://github.com/its-gaib/pubky-3d/actions/runs/34166507424).
Artifact `10034407245` belongs to that successful manual workflow, is about
62 MiB, and matches the repository, source SHA and workflow metadata. It was
extracted with the bounded runtime helper into a fresh directory. The isolated
runtime binds only to loopback and uses the nine explicit staging values.

The actual runtime passed a bounded 640×480 browser check: root HTTP 200,
WebGL scene ready with an enabled Camera and one canvas, no fallback, automatic
staging requests returning 200, no source switch or Detour menu, and the correct
Classic Pubky link. There were no JavaScript exceptions. The first browser
attempt failed during page creation under host resource pressure; a smaller
fresh-context retry completed in 39 seconds. The screenshot budget was exhausted,
so this increment does not claim fresh screenshots, mobile verification, or
playback verification of all 18 external videos. All browser contexts were closed.

The verified runtime now serves `127.0.0.1:4321`. Both `/` and `/sign-in` returned
200 after replacement, and the temporary server was stopped. The earlier runtime
is retained on disk for rollback. Evidence is recorded locally in
`/home/gaib/.cache/pubky-3d-browser/world-expansion-mini-results.json`.
Older sections describe historical checkpoints; their Example controls and smaller
layouts are superseded.

## Profile pictures and readable theater posts — 2026-09-07

Open PRs were checked before implementation: the fork had none, and no upstream
PR addressed this world UI. The relevant candidates,
[cache degradation handling](https://github.com/pubky/pubky-app/pull/2479) and
[article end-to-end tests](https://github.com/pubky/pubky-app/pull/2445), cover
different paths.

Interacting with a staging person now uses Pubky's existing avatar component.
The picture URL comes from the configured CDN and the validated profile ID;
profile-supplied image URLs are never loaded directly. Missing and failed images
use the existing fallback. Example characters retain their illustrated faces.

The raw theater content came from article and collection JSON envelopes being
treated as ordinary post text. Both tag leaves and Hot posts now parse by kind,
remove Markdown/HTML presentation, and display bounded readable text. Malformed
structured content gets an unavailable notice instead of its raw payload.
Short posts that intentionally contain JSON remain ordinary text. The theater
screen and reader now show a loading state until the complete lineup is ready;
timers pause while loading and resume without changing the engagement ranking.

| Check                                                    | Result                |
| -------------------------------------------------------- | --------------------- |
| World interface, images and loading transitions          | 16 passed             |
| Public staging data, canonical avatars and post previews | 24 passed             |
| Structured post preview boundaries                       | 8 passed              |
| Theater loading, ordering and playback                   | 7 passed              |
| Total unique focused tests                               | **55 passed**         |
| Focused TypeScript, including imported dependencies      | Passed                |
| ESLint, Prettier and whitespace checks                   | Passed                |
| Source-focused security review                           | No remaining findings |
| Full Next.js production build and TypeScript on Node 24  | Passed in CI          |
| Packaged staging `/` and `/sign-in` HTTP smoke           | Passed in CI          |

Security review identified excessive Markdown processing on adversarial long
content. Each extracted field is now capped at 2,048 characters before cleanup;
the complete JSON envelope is parsed within the existing 50,000-character
protocol limit. The final preview is capped at 1,200 characters. A regression
test uses a valid article with a 49,000-character adversarial body, and the
targeted security verification confirmed the fix.

Source commit: `30b771165fc2fd76af8a734f1be7d04f6d969991`.
The [full build](https://github.com/its-gaib/pubky-3d/actions/runs/34146435676)
passed compilation, TypeScript, standalone packaging and staging HTTP smoke.
Artifact `10027911624` belongs to that successful manual run and is approximately
62 MiB. Repository, event, workflow, source SHA and artifact metadata were checked
before download.
The developer has separately confirmed that staging login works; these checks
do not use a real identity or submit a post.

The archive was extracted into a fresh directory with the existing bounded
runtime helper. Both `/` and `/sign-in` returned HTTP 200 on the isolated server.
A normal WebGL browser probe reached a ready scene and an enabled Camera button,
with no fallback UI or JavaScript exceptions. The verified runtime now serves
the existing loopback preview at `127.0.0.1:4321`; both HTTP routes passed there
after replacement. The earlier runtime remains available on disk for rollback.

Extended headless checks encountered compositor and screenshot delays on the
shared host. A separate, explicitly controlled context with WebGL unavailable
checked the real Next application's accessible readers without that rendering
load. It held live staging requests and confirmed that the theater showed its
loading status with no old post cards or transport controls. Releasing the
requests loaded all eight ranked posts, including two articles, and removed the
loader when the reader was ready. A real profile image returned HTTP 200 from the
staging CDN and decoded at 320×320. This context recorded no JavaScript exceptions.
The regular 3D startup probe above and these reader checks are separate evidence;
fresh compositor screenshots and another camera export were not completed in
this increment. Earlier camera browser evidence and existing capture tests remain
recorded below.

A separate, labelled article response fixture also passed through the real
reader as readable text. A proposed collection slide was excluded by the
inherited Hot-stream collection filter, so it was not a valid browser fixture
for this screen. Collection normalization is covered by the pure preview tests;
no passing collection slide is claimed here. No fixture content was submitted
to Pubky. All browser contexts were closed after these checks.

## Expanded-world increment — 2026-09-07

The project now lives in the private `its-gaib/pubky-3d` repository on
`vibe/pubky-3d`. Both GitHub API access and Git pushes use `its-gaib`.

Open PRs were checked in the fork (none) and upstream. The upstream
[session consumer](https://github.com/pubky/pubky-app/pull/2483) and
[session bridge](https://github.com/pubky/pubky-app/pull/2484) are relevant to future
shared login, but require approved origins and a full deployed application. The
[2D graph explorer](https://github.com/pubky/pubky-app/pull/2138) depends on an
experimental Nexus graph API. None addresses this layout or standalone build work.

The walkable radius increased from 56 to 76, giving about 84% more area. Districts,
landmarks, coast trees, camera framing, fast travel, collision bounds and the pocket
map share the expanded layout. Walking paths are plain graphite, without lime borders.

| Check                                                   | Result                 |
| ------------------------------------------------------- | ---------------------- |
| Layout, movement, theater and bank unit tests           | 19 passed              |
| World interface unit tests                              | 9 passed               |
| Focused TypeScript, including imported dependencies     | Passed                 |
| ESLint and Prettier for changed source                  | Passed                 |
| Source, workflow and runtime-helper security review     | No actionable findings |
| Full Next.js production build and TypeScript on Node 24 | Passed in CI           |
| Packaged staging `/` and `/sign-in` HTTP smoke          | Passed in CI           |

Desktop and 390×844 mobile browser checks show the separated districts and
borderless paths, with no horizontal overflow or JavaScript exceptions. The
relocated bank opens its BRRR dialog. Bitkit travel reaches `(-28, 59)`, and ground
clicking moves to `(-29.14, 59.38)`: outside the old radius, inside the new boundary.
The updated [overview](./screenshots/overview.png) and [mobile](./screenshots/mobile.png)
show this expanded layout; other close-up screenshots below document earlier increments.
These visual checks used the demo harness.

The reviewed standalone workflow has been pushed through the `its-gaib` SSH
identity. The old OAuth workflow-permission blocker is resolved. The
[first manual build](https://github.com/its-gaib/pubky-3d/actions/runs/34139694301)
reached webpack, then exhausted Node's roughly 2 GiB heap. No artifact was produced.
A targeted check of unmerged fork and upstream PRs found no existing fix for this
failure. The CI build step now allows a bounded 4 GiB heap; the local runtime limit
remains 1 GiB.

The [retry](https://github.com/its-gaib/pubky-3d/actions/runs/34140453887) passed the
full Next.js build, TypeScript, packaging, staging HTTP smoke and artifact upload
at exact commit `cfac49132f5ad7ff88b96c80517411e4dfeeb22f`. Artifact `10025827105`
belongs to that successful manual run and is approximately 62 MiB. The repository,
event, workflow, source SHA and artifact metadata were checked before download.
Local runtime browser validation follows below. Local commits used the completed
focused checks above; CI provides the full build validation that the shared host
could not complete.

### Full staging preview

The verified archive was extracted into a fresh directory with bounded extraction,
path/type filtering and link validation. The server runs unprivileged on loopback
with a cleared inherited environment and the nine explicit staging runtime values.
Both `/` and `/sign-in` returned HTTP 200 locally. After the isolated browser check
on port 4323, the same runtime replaced the visual harness at `127.0.0.1:4321`.

The browser loaded the actual Next assets and real staging data. All 37 sampled
Nexus reads returned HTTP 200, with no partial-data or error notice. A world photo
downloaded as a nonblank 1270×800 PNG (216,009 bytes), with the HUD excluded.
**Sign in to post** opened **Join Pubky**, whose **Sign In** link navigated to the
same local `/sign-in` route. The desktop QR card and enabled **Copy authentication
link** control appeared; the mobile **Authorize with Pubky Ring** control was
enabled with no horizontal overflow. No JavaScript exceptions occurred. Four
requests were canceled during navigation or browser close; completed responses
were all successful.

This proves the live-data, capture and sign-in setup paths. No disposable staging
identity was supplied for account approval, so completed login, account bootstrap
and actual publishing remain unverified in this browser pass. No post was submitted.
The existing camera/composer unit checks are recorded below. After signing in,
return to `/` and take a new photo; guest photos are intentionally cleared by
navigation to sign-in.

Evidence: [full-app overview](./screenshots/staging-overview.png),
[downloaded world PNG](./screenshots/staging-photo.png), and
[photo review in the full app](./screenshots/staging-photo-dialog.png).

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

At this checkpoint, a prepared standalone workflow passed local YAML, shell,
archive-exclusion and unsafe-link fixtures. Its publication was blocked by the
then-selected GitHub identity's workflow permission, and the preview used the demo
harness without authentication or posting. The expanded-world checkpoint above
records the corrected `its-gaib` owner and successful workflow publication.

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
as available memory declined. There was no completed full Next build artifact at that checkpoint.
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

## Earlier visual preview scope

Before the full staging runtime above, visual checkpoints used a temporary Vite harness outside the repository,
at `/home/gaib/.cache/pubky-world-visual`. It renders the actual `World.tsx`, Three.js
engine, landmarks, styles and UI atoms. Its data-hook adapter supplies the example
neighborhood, its photo-posting adapter disables publishing, and Next links become
plain anchors. The staging button and photo panel explain the full-application
requirement. It does not simulate successful staging requests or supply fabricated
records labelled as real data.

That harness validates world appearance and controls. It cannot
validate the inherited Next layouts, authentication, live loader integration,
classic feed, profile or post routes. Staging evidence above comes from the earlier
real Next preview and subsequent API-boundary checks, not this visual harness.

Use the normal commands in [README.md](./README.md) on a machine with sufficient
free memory, or the verified standalone output of the manual Build workflow, to run
the full application. No preview adapter or reduced-validation configuration is
part of the production source.
