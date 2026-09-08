# Pubky World

A frontend experiment forked from `pubky/pubky-app` at the head of `dev`.
The exact fork point and destination are in [fork.json](./fork.json). The project
lives in the public `its-gaib/pubky-3d` repository, on `vibe/pubky-3d`, retaining
upstream history.

Credit to [Miguel Medeiros](https://miguelmedeiros.dev/) for the original
explorable 3D world that inspired Pubky World.

The root route is a walkable island connected to **Pubky production**. Public data
loads automatically; there is no network switch. Guests can explore and
read public profiles. The welcome screen leads with **Sign in and explore**, with
**Explore as a guest** as a secondary action. Signing in stays inside Pubky World,
returns to the island and starts walking after the session is fully restored;
existing users can choose **Enter your world**. The personal social circle loads
for the signed-in account. Account creation links to [pubky.app](https://pubky.app/).
The world header has no network badge or Classic Pubky link.

Pubky's near-black and graphite palette sets the scene, with acid-lime accents and
plain graphite walking paths. Your character wears a black hoodie with the
bundled Pubky logo on its chest and back, with no backpack. Sneaker accents are
customizable. Walk to discover places: there is no global destination menu or map
teleport navigation. The pocket map shows locations and your position.
The arena, Bitkit, portals, Satoshi, Tether and chessboard have no floating name labels;
their readers and nearby interactions reveal more as you approach.

## Places

- **Social Plaza:** a broad circle of people and real follow connections. Your
  follows stand larger and brighter; people they follow appear at roughly half
  that size. Large circles resolve into eight selectable neighborhoods. Each
  neighborhood has pages of up to 96 figures, with nearby and selected names.
  Sector cards preview two followed people's names and exact counts; previews
  share the existing profile queue and request at most 16 profiles. A persistent
  **Back to all sectors** button returns to the plaza overview, including after
  walking away from the plaza or shrinking the graph through unfollowing.
  The plaza directory searches every discovered public key and loaded name, with
  separate filters and 20-row pages. A person panel shows their profile picture,
  bio and latest readable post, plus Follow/Unfollow and **Meet in the plaza**;
  it does not list their connections. Missing images use Pubky's normal fallback.
  Follow changes update the scene as they sync, including size changes and
  discoveries that remain reachable through another followed person. The central
  graph sculpture has its own interaction linking to the Pubky Graph Explorer.
- **Tag Forest:** each tree represents a tag, and each paper leaf opens a post
  carrying it. A tree also opens an accessible list of its sampled posts.
- **The Arena:** a larger Roman amphitheater with two arcaded levels, oval seating
  tiers, sand, fire bowls and separate Pubky and Synonym symbol banners. Its wide
  entrance and center stay walkable. **Try out the Pubky Arena** opens the arena
  experiment; the local rock, paper, scissors challenge remains available. Two
  small bronze-armored gladiators circle, lunge, strike, parry and retreat in a
  playful 12-second duel. They are decorative performers, with no player combat.
- **Pubky University:** short lessons linking to the official Pubky documentation.
- **Open Source Yard:** workshops introducing the organization's GitHub projects.
- **Bitkit Beacon:** the official Bitkit logo extruded into a large orange landmark.
- **Trending Theater:** an open-air stage showing up to eight public Hot posts in
  total-engagement order, with no date-window claim. Each slide lasts 20 seconds.
  Opening its reader pauses the program; controls pause, resume or skip. The
  screen and reader show a loader while fetching. Articles become readable text,
  with unavailable notices for malformed content. Eight seated spectators are
  decorative scenery, not online users.
- **Midnight Cinema:** a crimson Art Deco movie house on the southwest coast,
  far from Trending Theater and rotated toward the plaza. The building and its
  36×20.25 screen are twice their previous width and height. The live screen
  carries a muted YouTube program, projected with the world camera. The 18 supplied
  videos shuffle; unavailable or embedding-disabled films skip automatically.
  A local loading card covers the player until its official API confirms playback.
  Failed reels stay skipped during that visit. Exhausted films, browser autoplay
  restrictions or player failures show a local intermission message; the reader
  retains a manual player with controls and reshuffling. The official YouTube API
  receives only fixed film IDs and the page origin. Conservative occlusion hides the overlay
  when scenery blocks it; video pixels never enter world photos.
  Walking-mode dragging now looks above the horizon while the camera stays above
  the ground, making the tall screen easier to frame.
- **Chess Citadel:** a full 32-piece board with obsidian and silver armies,
  sculpted knights, crowns and metallic details. Even the pawns stand taller than
  the persona. Signed-in visitors bring their most recently updated saved Chessky
  position from their own homeserver, including AI games and two-player games.
  A match plaque identifies the silver and obsidian players. Captured and promoted
  pieces update both their models and collision footprints. Scans with incomplete
  results say **Most recently updated game found**; the reader offers a refresh.
  Games are read-only snapshots, with no opponent mirroring or extra sign-in permissions.
  Guests and accounts without a valid saved game see the starting formation.
  Walk between the ranks and open **Play chess on Pubky** for Chessky.
- **Mention pills:** a runner laps a southern track beneath a large **@halfin**
  pill. His reader links to the experiment where autocomplete inserts a readable
  name pill, and a single Backspace removes the whole mention.
- **Next Stop: Pubky:** a northern departure deck has three floating destination
  dioramas: Prague rooftops, Lugano's lake and Alps, and Salvadoran volcanoes.
  Each boarding pass opens its official event: DARK Prague (October 2–4, 2026),
  Plan ₿ Lugano (October 23–24, 2026), or Plan ₿ El Salvador (January 29–30, 2027).
- **Tether monument:** a metallic extrusion of the official Tether company
  wordmark, lit green on its own pedestal. Its reader links to
  [Tether Ventures](https://tether.io/ventures/).
- **Satoshi monument:** an original seated, hooded laptop figure made of separated
  vertical steel contours. Its silhouette changes as you walk around it. The
  plaque is also reachable from the Social Plaza reader.
- **Brrr Bank:** one mounted **BRRR** facade sign vibrates at three times its previous frequency. Three hundred reusable
  dollar bills each live about 70 seconds, drift farther across the grounds, and
  independently shrink and fade; some rest on the floor first. Reduced motion
  keeps the sign and scattered bills still. There is no bank audio. The reader's
  **Where can I use Hard Money instead?** button beams you in front of Bitkit, facing its
  logo with the camera centered on the beacon. The bank reader is also available
  from the Arena panel.
- **Galactic jellyfish:** 24 glowing bodies swim in varied colors, sizes, depths,
  speeds and directions. Fourteen (about 60%) inhabit a farther band; ten retain
  the near envelope. Most stay low around the horizon, with a few higher accents.
  Cohorts and recycling use fixed world-space bounds independent of the camera.
  Bells pulse and tentacles trail; reduced motion freezes the population.
- **Seven planets:** varied procedural worlds include banded gas giants, an ocean
  world, lava, ice, a cratered moon and crystals. Three have tilted rings. Five
  sit lower around the horizon, with two higher accents and varying near/far depths.
- **Three portals:** walk into one glowing ring to exit at either of the other
  two at random. Arrival clearance, a cooldown and an exit gate prevent bouncing
  between portals. This replaces the former university shortcut.
- **Other encounters:** giant duck, trampoline, balloon, dancing and eight
  collectible keys. Keys and bills are local game props with no monetary value.

Profile markers, theater spectators and the walking persona are separate concepts.
The world does not show other connected players or claim live presence.

## Layout

The walkable radius is **160 world units**, with land radius 168, coast radius 172
and overview distance 435. This adds about 27% walkable area over the previous
142-unit radius, leaving space around the enlarged cinema. The Social Plaza retains
radius 32. Shared anchors align buildings,
paths, collisions, interactions, arrivals and the pocket map. The theaters are
about 143 units apart and face different directions. Walking mode uses a lower
camera angle to reveal the coastline and cosmic scenery.

| Place            | Ground X, Z |
| ---------------- | ----------- |
| Social Plaza     | 0, 8        |
| Tag Forest       | 36, -45     |
| Arena            | 55, 48      |
| University       | -26, -77    |
| Open Source Yard | -82, 22     |
| Bitkit Beacon    | -26, 94     |
| Trending Theater | -86, -52    |
| Midnight Cinema  | -77, 91     |
| Chess Citadel    | 91, -72     |
| Runner           | 70, 98      |
| Conference deck  | 0, -101     |
| Tether monument  | 30, -118    |
| Brrr Bank        | 108, 22     |
| Trampoline       | 102, -22    |
| Duck pond        | 24, 101     |
| Northern portal  | -26, -120   |
| Western portal   | -115, 54    |
| Eastern portal   | 115, 62     |
| Satoshi monument | -21, -29    |
| Balloon          | -120, 16    |

## Local preview

Use the Node version in `.nvmrc`, then install dependencies with `npm ci`.

```sh
npm run dev:webpack -- --hostname 127.0.0.1 --port 4321
```

Open `http://127.0.0.1:4321/`. From a host connected to this workspace over SSH:

```sh
ssh -fN -o ExitOnForwardFailure=yes -L 127.0.0.1:4321:127.0.0.1:4321 gaib
```

`-fN` leaves a background tunnel running on the host. The fork's dev/start
commands use `tools/world/run.mjs`, which selects all nine production network
values together from `world-production.json`. Deployed standalone servers must
receive the same nine `PUBKY_RUNTIME_*` values; the build workflow validates their
injected configuration. World reads, follow actions and photo drafts share one
complete production guard.

This switch starts a fresh production sign-in on a full page reload. All persisted
stores, IndexedDB, mute cursors and viewer tag markers use a lossless network
namespace. Legacy staging state is left untouched and is never imported. Shared
attachments use a separate production handoff cache. Automated verification uses
mock publication boundaries; do not use recovery phrases as test fixtures.

## Controls

| Input                                  | Action                                          |
| -------------------------------------- | ----------------------------------------------- |
| W A S D / arrows                       | Walk relative to the camera                     |
| Shift                                  | Run                                             |
| Space                                  | Jump                                            |
| E                                      | Interact with a nearby object                   |
| F                                      | Dance                                           |
| R                                      | Return to the plaza                             |
| Drag the scene                         | Orbit the camera                                |
| Scroll                                 | Zoom                                            |
| Click ground                           | Walk to that spot                               |
| Click a landmark, person, tree or leaf | Open its reader                                 |
| Click a social neighborhood            | Show its figures and contextual paging controls |
| Camera button                          | Capture and review a world photo                |

Touch movement, overview, moonlight, reduced motion, pocket-map visibility and
sneaker colors are available in the interface. Reading panels pause movement.
The in-zone Explore/read interaction opens the plaza directory; neighborhood
paging and the return-to-neighborhood-overview control appear after selecting a
3D neighborhood. Accessible readers remain available if WebGL cannot start.

## Camera and posting

Orbit and zoom, then use the camera button. The photo contains the rendered world
and your persona, with the HUD excluded. Review it, download a PNG, or hand it to
the existing Pubky post composer with an editable postcard caption. Publishing
uses that composer's **Post** button, authentication, attachment checks and image
sanitization. Posts publish to **Pubky production** after explicit review.

Capture is bounded to a 2048-pixel longest edge. Photos and drafts stay in memory;
preview object URLs are released when closed or replaced. Guests can download
first, then sign in. Navigating away to sign in clears the in-memory photo, and
an opened draft is cleared on logout or account changes. Profile photos and the
YouTube iframe stay in the DOM, keeping their pixels out of world captures.

## Implementation boundaries

- `src/components/templates/World`: HUD, readers, person directory, local arena
  game, cinema player, photo review, keyboard alternatives and touch controls.
- `world-scene.ts`: Three.js lifecycle, island, tag forest, hoodie persona, input
  and camera. Dynamic social updates do not rebuild the forest or reset the show.
- `world-social-layout.ts`: deterministic ID-based sectors, direct/secondary
  placement, pages and lookup of every discovered person.
- `world-social.ts`: shared instanced body meshes, bounded entry/exit transitions,
  nearby labels, real relationship lines, cluster counts and instance picking.
  An individual page contains at most 96 people; a second 96-slot pool permits
  outgoing figures to shrink away. The complete graph is retained outside that
  render window. Reduced motion applies transitions immediately.
- `world-layout.ts` and `world-motion.ts`: shared anchors, bounds, monument camera
  poses, camera-relative walking and simple collision resolution on a flat plane.
- `world-landmarks.ts`, `world-arena.ts`, `world-theater.ts`, `world-cinema.ts`,
  `world-satoshi.ts`, `world-tether.ts` and `world-bank.ts`: procedural places,
  local text/brand geometry and bounded decorative animation.
- `world-cinema-screen.ts`: a CSS3D projection, camera alignment, bounded
  occlusion checks, and teardown.
- `world-cinema-playback.ts` and `world-cinema-youtube.ts`: bounded reel recovery,
  official player events, one shared API loader and local loading/error states.
- `world-planets.ts`, `world-jellyfish.ts`, `world-chess.ts`, `world-runner.ts` and
  `world-portals.ts`: bounded cosmic scenery, monumental chess and local movement.
- `world-network.ts` and `world-production.json`: one coherent production target.
- `network-storage.ts`: network-separated persistence with no legacy restore.
- `world-cinema-program.ts`: the 18-video allowlist, shuffle and validated native
  `youtube-nocookie.com` playlist URL. It is separate from the cinema geometry.
- `world-post-preview.ts`: bounded, kind-aware readable previews shared by leaves,
  the post theater and selected profiles.
- `src/hooks/useWorldData`: automatic public production samples through existing
  controllers: up to six tag trees, four verified posts per tree, eight ranked
  posts and a small guest profile sample. Existing cache and moderation rules
  remain in those layers. A 20-second deadline bounds the sample loader.
- `src/hooks/useWorldSocial`: the signed-in viewer's complete two-hop graph target.
  It paginates direct follows first, then those people's follows, in bounded
  request batches with explicit progress, continuation and retry. There is no
  fixed total ID cap. Profiles load as the directory is browsed or a person is
  selected; latest posts load on selection. Follow writes wrap the existing
  application flow and update graph membership as they sync.
- `src/hooks/useWorldChess` and the Chessky controller/application/service: a
  bounded, read-only scan of the current actor's saved Chessky records. Canonical
  paths, participants, timestamps and legal move history are validated before a
  snapshot reaches the scene. Only the selected game's player names are fetched.
- `world-types.ts`: serializable data and `PersonaState`, independent of a future
  multiplayer transport. `src/hooks/useWorldPhotoPost` hands photos to the
  inherited composer.

Discovered IDs remain usable placeholders if profile hydration fails. Shared
second-degree people appear once and retain their known parents; direct membership
wins. Following/unfollowing updates the active graph, and only real loaded edges
are asserted. Incomplete discovery is labelled rather than presented as a complete
circle. Account changes invalidate pending graph/profile results. Already-issued
controller reads may still finish populating their shared cache after cancellation,
but cannot overwrite an obsolete world scope.

The inherited auth guard, database provider, account routes and write flows remain
in place. `/` is public; world chrome replaces the normal header and floating
button only on that route. Demo catalog data remains available for isolated tests,
with no example-mode control in the running world.

## Next multiplayer increment

`WorldController.getPersonaState()` returns position, heading and animation
without depending on a Pubky session. Preserve that contract when adding presence,
and keep remote players separate from social-graph figures and decorative extras.
A future service needs session-bound identity, room limits, update frequency,
interpolation, disconnect handling and position validation. Account keys and
recovery phrases must never become presence messages.

## Validation

```sh
npm run typecheck
npm run lint -- src/libs/world src/components/templates/World src/hooks/useWorldData src/hooks/useWorldSocial src/hooks/useWorldPhotoPost
npm test -- --maxWorkers=1 src/libs/world src/hooks/useWorldData src/hooks/useWorldSocial src/components/templates/World
npm test -- --maxWorkers=1 src/hooks/useWorldPhotoPost/useWorldPhotoPost.test.tsx src/components/organisms/DialogNewPost/DialogNewPost.test.tsx src/components/organisms/PostInput/PostInput.test.tsx
npm run build
```

These are validation commands, not a claim that the newest source has passed them.
See [the validation record](./validation.md) for exact build revisions, browser
checkpoints, security reviews and outstanding checks. The manual Build workflow
packages a standalone runtime; its bounded heap avoids compiling the full app on
the constrained preview host. Run local builds and a dev server sequentially when
they share `.next`. Screenshots are commit-specific checkpoints until refreshed.

The Vercel project uses `vercel.json` and `.vercelignore`. All nine runtime values
come from `world-production.json`, including when Vercel starts the app directly
without the local `npm start` wrapper. Deployment and registry URLs are recorded
in the validation record after their public checks pass.

## Sources and assets

Credit to [Miguel Medeiros](https://miguelmedeiros.dev/) for the original explorable
world that inspired this experiment. Its source code and assets are not copied. Buildings,
characters, vegetation and sculptures are generated from original procedural code.

University lessons link to [pubky.org](https://pubky.org/); workshops link to the
[Pubky GitHub organization](https://github.com/pubky/). The hoodie reuses the
inherited `public/pubky-logo.svg`. Arena banners use the exact inherited Pubky and
Synonym symbol paths from `src/libs/icons/icons.tsx`, without their wordmarks.

The Satoshi sculpture is an original procedural homage to Valentina Picozzi's
[Lugano monument](https://tether.io/news/plan-b-initiative-unveils-satoshi-nakamoto-statue-at-3rd-annual-plan-forum-in-lugano/).
Its separated vertical contours echo the disappearing-angle concept; no photograph
or third-party model of the artwork is bundled.

`public/world/bitkit-logo.svg` comes from the
[official Bitkit logo](https://bitkit.to/images/brands/logo-header-bitkit.svg), with
usage described by the [Bitkit brand manual](https://bitkit.to/brand-manual).
The Tether monument reuses the inherited `public/images/tether-text.svg` company
wordmark; [Tether's media assets](https://tether.io/media/) provide the official
brand reference. Both logos are parsed from fixed local paths and extruded with
Three.js SVGLoader. Brand ownership remains with the respective owners; the
repository's MIT license does not grant separate trademark rights.

Cinema videos are the 18 user-supplied YouTube IDs listed in
`world-cinema-program.ts`. Their content is played by YouTube on the ambient screen and in its reader,
not downloaded or bundled with the world.

Saved chess games follow [Chessky's published storage format](https://github.com/gcomte/chessky/tree/8958b28a52938d6789a29d8281cc54e2e4536829).
Legal move replay uses its existing `chess.js` version, 1.4.0 (BSD-2-Clause).
