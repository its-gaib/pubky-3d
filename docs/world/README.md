# Pubky World

A frontend experiment forked from `pubky/pubky-app` at the head of `dev`.
The exact fork point and destination are in [fork.json](./fork.json). The project
lives in the private `its-gaib/pubky-3d` repository, on `vibe/pubky-3d`, retaining
upstream history.

The root route is a walkable island connected to **public staging**. Public data
loads automatically; there is no Example/Staging switch. Guests can explore and
read public profiles. Signing in adds the current user's personal social circle.
The inherited feed remains at `/home`; **Classic Pubky** opens
[pubky.app](https://pubky.app/) in a new tab.

Pubky's near-black and graphite palette sets the scene, with acid-lime accents and
plain graphite walking paths. Your character wears a black hoodie with the
bundled Pubky logo on its chest and back, with no backpack. Sneaker accents are
customizable. Walk to discover places: there is no global destination menu or map
teleport navigation. The pocket map shows locations and your position.

## Places

- **Social Plaza:** a broad circle of people and real follow connections. Your
  follows stand larger and brighter; people they follow appear at roughly half
  that size. Large circles resolve into eight selectable neighborhoods. Each
  neighborhood has pages of up to 96 figures, with nearby and selected names.
  The plaza directory searches every discovered public key and loaded name, with
  separate filters and 20-row pages. A person panel shows their profile picture,
  bio and latest readable post, plus Follow/Unfollow and **Meet in the plaza**;
  it does not list their connections. Missing images use Pubky's normal fallback.
  Follow changes update the scene as they sync, including size changes and
  discoveries that remain reachable through another followed person.
- **Tag Forest:** each tree represents a tag, and each paper leaf opens a post
  carrying it. A tree also opens an accessible list of its sampled posts.
- **The Arena:** a larger Roman amphitheater with two arcaded levels, oval seating
  tiers, sand, fire bowls and separate Pubky and Synonym symbol banners. Its wide
  entrance and center stay walkable. The local challenge is rock, paper, scissors.
- **Pubky University:** short lessons linking to the official Pubky documentation.
- **Open Source Yard:** workshops introducing the organization's GitHub projects.
- **Bitkit Beacon:** the official Bitkit logo extruded into a large orange landmark.
- **Trending Theater:** an open-air stage showing up to eight public Hot posts in
  total-engagement order, with no date-window claim. Each slide lasts 20 seconds.
  Opening its reader pauses the program; controls pause, resume or skip. The
  screen and reader show a loader while fetching. Articles become readable text,
  with unavailable notices for malformed content. Eight seated spectators are
  decorative scenery, not online users.
- **Midnight Cinema:** a separate crimson Art Deco movie
  house beside Trending Theater, with a marquee, posters and a toy projector.
  **Start screening** loads a native YouTube player in its reader, using the 18
  supplied videos in shuffled order. The player handles advancing, skipping,
  pausing and fullscreen; **Shuffle a fresh program** creates another order.
  No player loads before that click. Video pixels never enter the 3D canvas.
- **Tether monument:** a metallic extrusion of the official Tether company
  wordmark, lit green on its own pedestal. Its reader links to
  [Tether Ventures](https://tether.io/ventures/).
- **Satoshi monument:** an original seated, hooded laptop figure made of separated
  vertical steel contours. Its silhouette changes as you walk around it. The
  plaque is also reachable from the Social Plaza reader.
- **Brrr Bank:** one mounted **BRRR** facade sign gently shakes. Thirty reusable
  dollar bills each live about 70 seconds, drift farther across the grounds, and
  independently shrink and fade; some rest on the floor first. Reduced motion
  keeps the sign and scattered bills still. There is no bank audio. The reader's
  **Where can I get Hard Money?** button beams you in front of Bitkit, facing its
  logo with the camera centered on the beacon. The bank reader is also available
  from the Arena panel.
- **Galactic jellyfish:** a persistent population swims through the space beyond
  the island in different colors, sizes, depths and directions. Their movement
  and recycling use a fixed world-space envelope, independent of the current
  camera direction or zoom. Bells pulse and tentacles trail; reduced motion
  freezes the population. The normal world camera can photograph them.
- **Other encounters:** giant duck, trampoline, portal, balloon, dancing and eight
  collectible keys. Keys and bills are local game props with no monetary value.

Profile markers, theater spectators and the walking persona are separate concepts.
The world does not show other connected players or claim live presence.

## Layout

The walkable radius is **112 world units**, with land radius 120, coast radius 124
and overview distance 312. The Social Plaza has radius 32. Model sizes stay
independent of the larger grounds. Shared anchors in `world-layout.ts` align
buildings, paths, collisions, interactions, arrival poses and the pocket map.
The cinema and Trending Theater are 41 units apart.

| Place            | Ground X, Z |
| ---------------- | ----------- |
| Social Plaza     | 0, 8        |
| Tag Forest       | 44, -40     |
| Arena            | 52, 42      |
| University       | -28, -66    |
| Open Source Yard | -65, 27     |
| Bitkit Beacon    | -36, 73     |
| Trending Theater | -69, -24    |
| Cinema entrance  | -72, -65    |
| Tether monument  | 34, -88     |
| Brrr Bank        | 88, 8       |
| Trampoline       | 77, -24     |
| Duck pond        | 24, 80      |
| Portal           | -4, -96     |
| Satoshi monument | -21, -29    |
| Balloon          | -86, 47     |

## Local preview

Use the Node version in `.nvmrc`, then install dependencies with `npm ci`.

```sh
npm run dev:webpack -- --hostname 127.0.0.1 --port 4321
```

Open `http://127.0.0.1:4321/`. From a host connected to this workspace over SSH:

```sh
ssh -fN -o ExitOnForwardFailure=yes -L 127.0.0.1:4321:127.0.0.1:4321 gaib
```

`-fN` leaves a background tunnel running on the host. Development runtime
configuration defaults to staging. World loaders require the staging environment
label and exact official staging Nexus URL; they reject mismatched or production
endpoints. Use test keys for the inherited account flows.

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
sanitization. This experiment targets staging.

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
- `world-cinema-program.ts`: the 18-video allowlist, shuffle and validated native
  `youtube-nocookie.com` playlist URL. It is separate from the cinema geometry.
- `world-post-preview.ts`: bounded, kind-aware readable previews shared by leaves,
  the post theater and selected profiles.
- `src/hooks/useWorldData`: automatic public staging samples through existing
  controllers: up to six tag trees, four verified posts per tree, eight ranked
  posts and a small guest profile sample. Existing cache and moderation rules
  remain in those layers. A 20-second deadline bounds the sample loader.
- `src/hooks/useWorldSocial`: the signed-in viewer's complete two-hop graph target.
  It paginates direct follows first, then those people's follows, in bounded
  request batches with explicit progress, continuation and retry. There is no
  fixed total ID cap. Profiles load as the directory is browsed or a person is
  selected; latest posts load on selection. Follow writes wrap the existing
  application flow and update graph membership as they sync.
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

No public deployment or Vibes registry PR is included in this increment.

## Sources and assets

The explorable island at [miguelmedeiros.dev](https://miguelmedeiros.dev/) supplied
the high-level inspiration. Its source code and assets are not copied. Buildings,
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
`world-cinema-program.ts`. Their content is played by YouTube after interaction,
not downloaded or bundled with the world.
