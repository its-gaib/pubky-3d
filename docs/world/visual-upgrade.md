# Local visual upgrade

The upgrade starts with the people and extends the Roman arena's level of
construction across the island: shaped silhouettes, distinct materials,
architectural depth and details that become visible when walking closer. The
graphite palette, black Pubky hoodie, official marks and lime accents remain.
The existing Roman arena remains the architectural reference.

Work started September 10, 2026 at 21:50 UTC, with a maximum window ending
September 11 at 04:50 UTC. Changes are uncommitted and local. Nothing has been
deployed or pushed. The original overnight pass finished before that deadline;
the identity revision below follows the user's subsequent morning feedback.

## People first

The current identity revision replaces the explorer and social figures' invented
faces with an anonymous graphite mask: a shaped shell, smoked horizontal visor,
metal seams and small lime inlays. Guests and profiles without an available,
approved image keep this mask. Grouped overview sculptures now represent actual
community members with their approved pictures, using masks when a member has
no available picture. No age or demographic appearance is inferred for these heads.

For an available profile image, a convex, rounded portrait surface wraps the
front of the head. Player and social portraits preserve the original image's
colors and aspect ratio, with a 20% centered zoom that reduces the outer margin
around a face. The same crop applies to artwork, logos and animal pictures.
The head adds
physical curvature; it is **2.5D image treatment, not facial reconstruction**.
No generic eyes, brows, mouth, hair or blinking are drawn over somebody's image.
The explorer keeps its layered black hoodie, official front/back Pubky marks,
seams, cuffs, drawstrings, pocket and constructed sneakers, with articulated
walking, jumping and dancing and a still reduced-motion pose.

Social figures retain three clothing styles and stable outfit variation. Direct
follows remain larger and brighter than discoveries, while profile imagery
keeps its true colors. Instancing retains every person on the existing pages.
Larger networks keep their central and satellite community sculptures.

Hal Finney's runner now uses a distinct sculpted head informed by photographs
of him as a young adult: his forehead, cheeks, longer nose, jaw and side-parted
wavy hair, with a calm expression. This is a stylized interpretation, not a
photoreal scan. See [the reference notes](hal-finney-reference.md). The athletic
kit, race bib, headband, jointed stride and mention interaction remain.
The theater audience and arena duelists retain the earlier youthful treatment.

### Profile image behavior

The existing account hook supplies the player identity. A separate world hook
checks profile moderation and current account/network ownership before passing
canonical avatar identities to the renderer. Logout, restoration, moderation
blur, changed image URLs and missing images clear the affected head. Previously
approved unchanged neighbors remain visible while new neighbors are checked.
Visible personal profiles load in the existing batches of 20 so all 96 people
can eventually receive metadata without raising the manager's request limit.
The grouped overview selects up to 32 real members in stable ID order, using
the same selector for profile admission and head rendering. Picture availability
or later name enrichment never rotates the selected members. Their heads still
open the corresponding neighborhood. Overview/page transitions retain at most
128 relevant identities, within the existing 192-slot budget.

Only the fixed production avatar CDN route is accepted. Images use credential-
free CORS requests, and static PNG/JPEG/WebP containers are checked before decode.
Requests are bounded to two active jobs, a 193-job queue, 2 MiB per image and
2048 pixels per axis / 4 million source pixels. Active requests have a ten-second
deadline; queue waits have a separate sixty-second deadline. Decoded images have
a maximum longest edge of 512 pixels. Unsupported, animated, transparent-empty, blocked or failed
images remain masked. No photos are sent to another service.

Loaded images replace the mask with a curved image head and a modeled rear shell.
A separate bounded head proxy keeps picking in original person order while
portrait and mask draw batches compact independently.

The player has a 512-pixel portrait texture. The social render window shares one
2048-pixel atlas with 128-pixel tiles, up to 192 leases for current and outgoing
figures, and one instanced image draw. Slots are cleared and pending requests
aborted when ownership changes. Exact lease checks prevent late results from
painting a different person. Bitmaps close after copying into the atlas canvas;
GPU texture updates batch per frame and resources are released on teardown.

### Face reconstruction investigation

A local MediaPipe Face Landmarker worker could estimate a front-face relief from
one sufficiently clear portrait. Its current JavaScript, WASM and model assets
add about 16 MB before transfer compression, and its landmarks do not reconstruct
hair, ears or the unseen back of a head. Ambiguous artwork and multi-face images
would still need the original picture treatment. That model is not included in
this revision; preserving identity reliably takes priority over producing an
unreliable invented likeness. [Official web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js),
[face mesh model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf).

## Island inventory

| Element                | Implemented detail                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lighting and materials | Warm daylight, cool night lighting, a local reflection environment, stable shadows concentrated around the walking camera and sharper rendering on dense displays.                 |
| University             | Fluted columns, Ionic volutes, recessed openings, roof courses, entrance detail, medallion and planters.                                                                           |
| Open Source Yard       | Workshop bays, server racks, roof vents, construction trim, a detailed forklift, crates and a cable reel.                                                                          |
| Bitkit                 | The original logo silhouette with clean bevels, corrected face shading, structural supports and a detailed orange plinth.                                                          |
| Duck pond              | A rounded duck with a shaped beak, eyes and wings, surrounded by a stone pond, reeds, lilies and ripples.                                                                          |
| Trampoline             | Constructed legs, springs, edge padding and net details.                                                                                                                           |
| Portals                | Layered frames, energy glass, bolts and substantial bases.                                                                                                                         |
| Bank                   | Fluted columns, deep vault, handwheel, bolts, cornices, facade courses, printer and higher resolution bill and sign artwork.                                                       |
| Cinema                 | Art Deco piers, gold trim, recessed doors, ticket booth, posters, curtain folds, projector and marquee bulbs.                                                                      |
| Theater                | Stage planks, lattice truss, cables, grounded supports, slatted benches, footrails and aisle lights.                                                                               |
| Conference deck        | Prague bridge and Gothic towers; Lugano lake, boats, villas and hills; San Salvador volcano, cathedral and palms. The shared deck gains railings, framing and sharper event cards. |
| Chess                  | Smooth turned pieces, shaped knights, hollow rook crenellations, bishop mitres, crowns, beveled board edges, engraved coordinates and inlays.                                      |
| Satoshi sculpture      | The existing layered, faceless silhouette with beveled steel sheets, refined shading, a constructed plinth and a mounted plaque.                                                   |
| Tether                 | The existing mark and orientation with cleaner bevel shading, supports, mounting and a refined plinth.                                                                             |
| Forest and post leaves | Tapered trunks, root flares, curved branches, layered foliage and textured paper leaves with folds, clips, twine and readable post excerpts.                                       |
| Ground and coast       | Textured soil, moss, stone and paving; a basalt shore with rock formations; gently shaped water, surface detail and broken foam rings.                                             |
| Vegetation and paths   | Layered coastal pines, clustered grass, pebbles, detailed flowers and path lamps placed clear of entrances and walking routes.                                                     |
| Graph observatory      | A layered plinth, tripod, satellite collars, a wire cage around the core and refined orbital forms.                                                                                |
| Balloon and keys       | Fabric panels, seams, rigging, a woven basket and burner; collectible keys with beveled bows, shafts, teeth and inlays.                                                            |
| Planets                | Distinct procedural surfaces for all seven planets, including cloud layers, continents, storms, craters, lava, ice and crystal detail.                                             |
| Jellyfish and sky      | Scalloped translucent bells, radial veins, frilled arms, tapered moving filaments and a restrained static star field.                                                              |
| World interface        | Clearer welcome and controls, graphite panels, readable readers, sticky close buttons, profile and directory polish, an illustrated pocket map and responsive touch controls.      |

## Preserved behavior and resource bounds

Walking still reveals the island's destinations. Existing entrances, obstacles,
portal travel, selections and interactions remain in place. Official logo
geometry and the sculpture's layered identity are preserved.

- Social pages retain 96 complete figures, plus up to 96 outgoing figures during
  transitions. Pagination, relationship scale, profile selection and larger
  network grouping remain available.
- The scene retains eight seated spectators, eight jellyfish, seven planets,
  three conference events, 32 chess pieces, 150 bank bills, eight collectible
  keys and 160 flowers.
- The runner keeps its ten-second route and mention interaction; the arena keeps
  its twelve-second duel. Cinema screen proportions, theater programming and
  conference links remain unchanged.
- Chess still supports saved positions, captures and promotions. Visual batches
  have capacity for all 32 pieces even when promotions change their types.
- Rendering uses shared geometry, material batching and instancing. Social
  figures use frustum culling with refreshed bounds after position updates.
- Pixel density is capped at 2× with a 3.2-million-pixel supersampling budget. The
  ratio never falls below 1, so native 4K rendering remains native resolution.
- Decorative motion respects reduced motion. Procedural textures are generated
  locally; geometry, materials, textures and instance resources have explicit
  cleanup paths.

## Discoverable transport

Six rides are scattered around the island: skateboard, jetpack, kart,
BMX, hoverboard and a sleeping dragon. They are physical discoveries rather than map destinations.
Walk close and press **E** to mount; clicking a distant item approaches it first.
Use the existing movement controls, **Space** to jump, **F** for each item's
stunt, and **E** to step off on clear ground. The jetpack uses held **Space** to
rise and **C** to descend; it hovers when both are released. **Shift** slows a
manually controlled ride. The dragon flies itself along changing routes and
ignores steering and lift inputs. Touch controls expose the equivalent actions.

The skateboard kickflips, BMX backflips, kart barrel-rolls, hoverboard spins and
jetpack corkscrews. The dragon performs a roll and breathes fire once high enough
for its wings to clear the ground and surrounding buildings. **E** requests a
clear landing; the dragon completes its stunt, descends and automatically lets
the rider off. Rider joints follow grips, pedals and seats. Motion is bounded
by the island and each vehicle footprint; flight also checks building tops and
elevated panels. Flying rides can pass over roofs and must descend over clear ground
to dismount. Pause, blur and travel clear held inputs; destination travel returns
the mounted item to its discovery location. Forest refreshes preserve parked
items and their obstacle slots; saved chess pieces retain live collision updates.

The dragon sleeps in the southeast at `[112, 102]`, with folded wings and a
breathing pose. Mounting wakes it, and flying opens and flaps its wings; stepping
off lets it settle back to sleep. Its saddle, grips and footrests support the
same articulated persona. The jetpack now emits longer orange/gold flames around
a white core, with stronger ascent thrust and clearance above the ground.

The flamethrower rests at `[-64, -8]`, just northeast of the Open Source Yard.
**E** equips or drops it; hold the mouse, **B**, or the touch Fire button to fire
while dragging the camera to aim. Its two hand grips follow the explorer's arms.
The flame stream reaches 22 units; dragon fire reaches 32. Both share capped
flame, smoke and ember instances. Logical world objects burn for approximately
4–7 seconds at their original size, then explode into orange/gold fire, radial
sparks, smoke and tumbling solid fragments. The additional fragment pool has
96 slots; fragments keep their size and fade after tumbling. Reduced motion
uses a steady fading burst without radial movement or fragment spin.
People are separate: they choose different outward routes, run while burning,
then fall beyond the island's coast and disappear. Flames follow their current
bounds throughout their escape. Social people keep their approved portraits
or anonymous heads while running, including across paging and data refreshes;
the currently visible people in sector sculptures escape independently of
their exploding plinths. Hal and other decorative performers separate from
their scenery when it catches fire.
Burned collision and interaction are disabled. In-memory identities retain
destruction across scene/data rebuilds until a document refresh; no profiles,
posts, database records or network resources are deleted. Terrain and the active
player stay available for walking. Pause, blur, lost pointer capture and tool
changes release held fire. The cinema's playback is stopped when it burns.

The camera begins following horizontal travel after 0.3 seconds of movement,
easing in over 1.2 seconds. It gradually turns behind the character without
changing the direction of a held movement input. Manual orbit takes priority
and postpones following for two seconds. Overview, paused landmark views,
reduced motion and flamethrower aiming retain their existing camera behavior.

Geometry and materials are shared; scene teardown
also releases the model currently attached to the rider. Reduced motion freezes
idle fans, sleeping breaths and decorative flicker, while intentional movement and stunts remain.

## BRRR and Bitkit Hot Sauce

The bank now uses **150 bills**, half the previous 300. The same normalized
trajectory runs over **7 seconds instead of 70**, so flight, settling, fade and
recycling all run ten times faster. Bills remain staggered and use one reusable
instanced draw.

A building-sized red chili lying in its own northwest clearing opens **BITKIT HOT SAUCE**, shows the exact
fourth **Fiat Meltdown** image requested by the user, and links to @bitkitwallet
for updates about where free sauce is available. See the [image source notes](hot-sauce-reference.md).

The island now has a 180-unit walkable radius (about 27% more area than radius
160), with proportionally expanded land, coast, overview and shadow coverage.
The chili lies directly on the ground at `[-108, -103]`, about 213 units from Bitkit
and 196 from Midnight Cinema. A trail from the university reaches its inward-facing low plaque;
the clearing reserves room for walking and riding, with meadow plants kept
outside the approach. The original upright pedestal has been removed.

## Local preview

The full Next application uses production network configuration and local source
changes at `http://127.0.0.1:4321/`. Production sign-in through Pubky Ring was
browser-checked and confirmed by the user. No deployment is needed to use a
production account locally. See [environment settings](../environment.md) for
this fork's production startup wrapper and optional low-memory development mode.

Forward the app from the host machine:

```sh
ssh -fN -o ExitOnForwardFailure=yes -L 127.0.0.1:4321:127.0.0.1:4321 gaib
```

The separate review harness lives outside the repository at
`/home/gaib/.cache/pubky-world-night-review`. Its fixed `npm run dev` command now
binds only to `127.0.0.1:4322`, so it cannot replace the real sign-in app. It uses
sample people/posts and disables sign-in, publication and video playback.
Start this harness on demand for `/review.html`, `/identities.html` or
`/scene.html`; `?before` on the raw scene selects the saved original source.
Forward port 4322 separately if opening the fixture gallery from another machine.

Screenshots and machine-readable capture results are stored in
`/home/gaib/.cache/pubky-world-night-review/evidence`. The capture harness uses
matching camera positions, sample data and reduced motion. Final screenshots
cover the people, scenery, landmarks, venues, all seven planets and the
desktop/mobile interface. The gallery contains 24 images, with keyboard-accessible
sliders comparing the anonymous and profile heads, and the original and upgraded
island. Each comparison links to its full images.

## Validation record

The following table records the original overnight upgrade, before the current
identity revision. Current identity checks are recorded separately below it.

| Check                                              | Result                                                                                                                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused world, World template and world hook tests | All 325 unique tests are covered by passing results: 323 passed in the combined run; the two failed expectations were corrected and both affected files passed a four-test rerun.                                                    |
| Corrected expectations                             | Ground checks now exclude the chess pieces' visual batches; sculpture checks account for the existing nearly zero-width outer sheet while retaining thickness and spacing checks.                                                    |
| Security review of the final implementation        | No actionable findings in the full review or the final runner material verification. Review included bounded post text, avatar sources, saved chess state, same-origin asset loading, procedural resources and the isolated preview. |
| Scoped scene TypeScript check                      | Passed.                                                                                                                                                                                                                              |
| Full project typecheck                             | **Unverified due to host memory limits.** The 1,536 MB heap attempt exhausted memory (exit 134); the 2,048 MB attempt was killed (exit 137). Neither completed.                                                                      |
| Production build                                   | **Unverified due to host memory limits.** With a 1,536 MB heap, the Next.js build worker was killed by SIGKILL before emitting source compiler diagnostics.                                                                          |
| Final lint, formatting and diff checks             | Passed. The preceding pass checked all 49 changed TypeScript sources with ESLint and 51 source files with Prettier; the final three TypeScript files and CSS changes passed again, as did `git diff --check`.                        |
| Final browser sweep                                | Completed with empty error logs. Captures cover every scene category and all seven planets, plus desktop 1280×800, portrait 390×844, landscape 844×390 and compact landscape 568×320.                                                |
| Runtime behavior and cleanup                       | All nine checks passed in `final-runtime.json`, covering movement and paused input, PNG capture, social populations and selection, post selection, saved chess promotions, night lighting and resource cleanup.                      |
| Preview and comparison gallery                     | Running and browser checked. All 20 images and both accessible comparison sliders passed; desktop and mobile layouts have no overflow. Results are recorded in `final-gallery.json`.                                                 |

A final rerun after the last refinements passed all 77 tests across eight files,
followed by another passing scoped scene TypeScript check. These results and the
final lint and format checks are recorded in `final-bounded-validation.json`.

The earlier expression revision passed its 37 character tests and scoped checks.
The current identity revision supersedes its explorer, social and Hal heads.

The identity revision passes **181 relevant tests across 11 files**: 104 hook,
World integration and social-data tests; 54 loader/atlas tests; and 23 character
and picking tests. The final scoped scene TypeScript check also passes.
Current identity sources pass ESLint. The final Prettier check passes all 65
changed source/document files, and `git diff --check` passes.
The mixed portrait/mask raycast regression verifies original person ownership
when image and mask batches have different instance counts. The Hal refinement
remains within the existing runner triangle budget. Initial test failures in the
new picking proxy allocation and Hal tessellation were fixed and rerun.

Security review found no actionable issues in the image loader, hook permission
fences, atlas leases or final geometry/picking refinement. Read-only production
CDN probes confirmed successful WebP responses with CORS enabled. The initial
browser pass checked profile/artwork/failure switches, mixed social identities
and PNG capture without page or console errors; follow-up captures refine the
curved head and Hal hairline. The final browser transport check in
`identity-cors-runtime.json` passes all six checks without page or console errors:
96 profile heads loaded through the browser's cross-origin fetch path using
controlled CDN responses, profile-head picking, an origin-clean PNG export,
requests without credentials or referrers, immediate restoration of all 96 masks
when identities clear, and canvas cleanup.

The final `identity-ui-smoke.json` passes all four identity controls at 390×844
without overflow or overlapping the canvas, and confirms the actual World
template initializes with the identity controller and an anonymous player.
`final-gallery.json` now records all 24 images and both accessible sliders passing
on desktop and mobile. These final checks have no page or console errors.
Browser processes are serialized on this host; earlier follow-up captures hit
memory pressure or software-rendering timeouts.

The runtime check retained all 96 social figures while rendering zero human
batches when the crowd was outside the view. It also verified both complete
pages and the 192 transition slots. Repeated forest refreshes remained bounded;
world disposal released its canvas and WebGL context.

The fully loaded overview comparison uses matching 1280×800 views, recorded in
`before-tour.json` and the earlier `badass-tour.json` (before the identity revision):

| Renderer counter | Original |  Upgraded |
| ---------------- | -------: | --------: |
| Render calls     |    1,825 |       923 |
| Triangles        |  263,863 | 2,251,733 |
| Geometries       |      810 |       478 |
| Textures         |       38 |        80 |

Batching reduces render calls by approximately 49%, while the finer geometry
increases triangle work by about 8.5× and adds textures. The counters include
the shadow pass and describe scene work, not hardware frame rate. Full project
typechecking and the production build remain unverified on this host despite
the passing scoped check and runtime results.

World has no sibling visual regression test or checked-in pixel baseline. The
comparison screenshots provide the current visual evidence. A dedicated,
deterministic World VRT baseline can be added after the visual direction is
accepted.

## Follow-up validation after production sign-in

Production sign-in was verified with the real Pubky Ring QR and all nine
production network settings, then confirmed by the user. The local Next server
was paused during memory-intensive checks and restored on the same port 4321;
browser sign-in storage was not cleared. A final browser check entered the world
through the real app's guest button and found a visible, focusable WebGL canvas
with no page errors. The real preview remains running; the separate test fixture
server was stopped after verification.

- Transport models, rider poses, collision/flight and lifecycle: 44 passing tests.
- Final World template: 41 passing tests, including held inputs, teardown and the
  hot-sauce panel. The direct Prism imports also pass all 34 PostCodeBlock tests.
- Bank and chili: 15 passing tests; the six chili tests passed again after moving
  the pedestal clear of the cinema to `[-48, 95]`.
- Own portrait zoom: 24 passing atlas/persona tests. Representative portrait
  admission: 17 passing hook tests. Shared selection and social rendering:
  26 passing tests, including the 192-slot transition limit and revocation.
- Browser checks exercised all five rides, air stunts, jetpack flight, pause,
  travel reset and forest refresh. Six touch layouts passed at 390×844,
  568×320 and 844×390. The exact sauce image loaded in all three modal layouts.
- The grouped portrait browser check loaded all six selected heads across three
  populated sectors from a 192-member fixture, preserved sector picking and a
  page roundtrip, and restored masks immediately on identity clearing. Avatar
  requests carried no cookies, authorization or referrer headers.
- Scoped scene TypeScript, focused ESLint, formatting and diff checks passed.
  Security review found no actionable issue in the final changed paths.

Evidence is stored in the external review directory, including
`morning-checkpoints.json`, `transport-runtime.json`,
`transport-mobile-smoke.json`, `hot-sauce-runtime.json`,
`hot-sauce-clearance.json`, `overview-portraits-runtime.json` and
`production-world-smoke.json`.
The full project typecheck and production build remain unverified because of
host memory limits; no deployment or remote Git update was performed.

## Dragon fire and local destruction follow-up

The current checkpoint passes 177 focused unit tests: transport motion/models
and fire effects (51), burning/environment adapters (19), persona/held controls/
World/portals (79), social rendering (16), and individual jellyfish burns (12).
Scoped scene TypeScript, focused ESLint, formatting and diff checks pass. The
security review and its targeted jellyfish follow-up found no actionable issue.

A complete scene browser check confirmed pickup at exactly `[-64, -8]`, live
flamethrower ignition, release on pause/blur, disappearing chili geometry and
collision, preservation through data refresh, and restoration after document
refresh. It also confirmed autonomous dragon travel above 30 units, fire during
the roll, and landing with automatic dismount. The separate mobile review passed
33 layouts and six hold/release sequences at 390×844, 568×320 and 844×390. It uses
the actual controls, shared World CSS and font in a shell fixture; the complete
scene check covers the controller integration.

The full-scene browser fixture uses a static bundle, 640×480 rendering and
disabled shadows to fit the workspace's memory limit alongside the real Next
preview. Product rendering settings are unchanged. The real Next app remains on
port 4321; no authentication state was cleared and nothing was deployed.
New evidence includes `fire-world-runtime.json`, `jellyfish-burn-tests.json`,
`controls-mobile-smoke.json` and the fire screenshots in the external review
directory.

## Explosions, fleeing people and camera follow

The next local follow-up replaces burn collapse with an explosion and gives
people a separate escape lifetime. It covers social figures, visible sector
representatives, Hal, eight theater spectators and both arena gladiators.
Scenery and its people own separate physical targets. Social admission reserves
96 escape slots alongside a complete 96-person page, including repeated data
changes while other people are still running.

All **105 focused tests pass**: burn/environment/escape/runner/jellyfish (42),
social rendering and capacity (20), fire effects (8), camera/walking (16),
theater (11), and arena (8). Scoped scene TypeScript, focused ESLint, formatting
and diff checks pass. The security review and targeted capacity verification
found no actionable issue.

The actual scene browser check confirms gradual camera following, stable held
travel, manual orbit priority, an intact chili immediately before its explosion,
48 flying fragments afterward, all human types escaping without an explosion,
and disappearance persisting through data refresh and resetting on document
refresh. A separate 144-person social fixture confirms that four visible
representatives outlive their exploding plinth and later disappear individually.
It compiles and renders their actual moving shadow materials using an isolated
512-pixel shadow map. Both checks finish with zero browser errors.

The full scene uses the same constrained static fixture described above; this
is not a full production-build or full-quality shadow performance check. New
evidence is in `explosion-escape-world.json`, `social-sector-escape-shadows.json`
and matching screenshots under the external review directory. The real Next
preview on `127.0.0.1:4321` returns HTTP 200. Nothing was deployed.
