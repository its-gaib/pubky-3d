'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Compass,
  Footprints,
  Hand,
  Info,
  Leaf,
  LoaderCircle,
  Map,
  Moon,
  MousePointer2,
  MoveUp,
  Orbit,
  Pause,
  Play,
  Scissors,
  Settings2,
  Sparkles,
  Sun,
  Theater,
  TreePine,
  Trophy,
  VolumeX,
  X,
} from 'lucide-react';
import { AUTH_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Switch } from '@/atoms/Switch/Switch';
import { useAuthStatus } from '@/hooks/useAuthStatus/useAuthStatus';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useWorldData } from '@/hooks/useWorldData/useWorldData';
import { useWorldSocial } from '@/hooks/useWorldSocial/useWorldSocial';
import { Bitkit, Github, PubkyIcon } from '@/icons';
import { GITHUB_PROJECTS, UNIVERSITY_ARTICLES, WORLD_EXPERIMENTS, WORLD_ZONES } from '@/libs/world/world-catalog';
import { WORLD_CONFERENCES } from '@/libs/world/world-conference-catalog';
import { consumeWorldEntry } from '@/libs/world/world-entry';
import { WORLD_PORTALS, WORLD_RADIUS } from '@/libs/world/world-layout';
import {
  SOCIAL_PAGE_SIZE,
  socialViewForPerson,
  socialViewPageCount,
  socialViewPeople,
} from '@/libs/world/world-social-layout';
import type {
  WorldController,
  WorldData,
  WorldInteraction,
  WorldPost,
  WorldSocialView,
  WorldStatus,
  WorldZoneId,
} from '@/libs/world/world-types';
import styles from './World.module.css';
import { WorldCamera } from './WorldCamera';
import { WorldCinema } from './WorldCinema';
import { WorldConferences } from './WorldConferences';
import {
  worldDirectoryPage,
  type WorldDirectoryScope,
  WorldPeopleDirectory,
  WorldPersonPanel,
  type WorldSocialState,
} from './WorldSocialPanel';

const PERSONA_COLORS = ['#c8ff03', '#ff9155', '#b59bff', '#5fe5e7', '#ff89c8'];
const MAP_SCALE = 39.2 / WORLD_RADIUS;
const MAP_CENTER = WORLD_ZONES.find((zone) => zone.id === 'plaza')!.position;
const INITIAL_STATUS: WorldStatus = {
  zone: 'plaza',
  position: [0, 8],
  nearby: null,
  collected: 0,
  theaterIndex: 0,
  theaterPaused: false,
};
type Panel = WorldInteraction | { kind: 'settings' };

function ExternalWorldLink({ href, children, className }: { href?: string; children: ReactNode; className?: string }) {
  // Content links are rendered as text unless they are safe external HTTPS URLs.
  if (!href || !/^https:\/\//i.test(href)) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <ArrowUpRight size={15} aria-hidden="true" />
    </a>
  );
}

function panelHeading(panel: Panel, data: WorldData): { title: string; subtitle: string } {
  switch (panel.kind) {
    case 'conference':
      return {
        title: WORLD_CONFERENCES[panel.index]?.name ?? 'Conference Grove',
        subtitle: WORLD_CONFERENCES[panel.index]?.description ?? 'Meet the ideas gathering around the world.',
      };
    case 'portal':
      return {
        title: WORLD_PORTALS[panel.index]?.name ?? 'The Credible Exit',
        subtitle: 'Three doors. Two possible destinations. Absolutely no departure lounge.',
      };
    case 'settings':
      return { title: 'Make yourself at home.', subtitle: 'A few little ways to make this world yours.' };
    case 'zone': {
      const zone = WORLD_ZONES.find((item) => item.id === panel.id)!;
      return { title: zone.name, subtitle: zone.description };
    }
    case 'tag':
      return {
        title: `#${data.tags[panel.index]?.label ?? 'Tag tree'}`,
        subtitle: 'A little branch of the conversation. Pick a leaf and stay a while.',
      };
    case 'post':
      return {
        title: 'A leaf worth reading.',
        subtitle: `From the #${data.tags[panel.tagIndex]?.label ?? 'tag'} tree.`,
      };
    case 'person':
      return {
        title: data.people.find((person) => person.id === panel.id)?.name ?? 'A fellow explorer',
        subtitle:
          data.source === 'demo'
            ? 'A fictional neighbor in our example social graph.'
            : 'A public profile from Pubky production. This is a profile marker, not a player online.',
      };
    case 'social-cluster':
      return { title: `Neighborhood ${panel.sector + 1}`, subtitle: 'A closer look at your social constellation.' };
    case 'fun':
      return {
        duck: {
          title: 'You have been quacknowledged.',
          subtitle: 'Captain Quack, unofficial mayor of this particular puddle.',
        },
        trampoline: { title: 'A small leap for a person.', subtitle: 'A deeply unnecessary leap for social media.' },
        satoshi: {
          title: 'Present. Absent. Satoshi.',
          subtitle: 'A monument to the person who left the keys with everyone else.',
        },
        bank: {
          title: 'Brrr. There it goes.',
          subtitle: 'The bank where money is always in the air. And occasionally on your shoes.',
        },
        tether: {
          title: 'The Tether monument.',
          subtitle: 'A green-lit landmark with a view toward what comes next.',
        },
        graph: {
          title: 'The heart of the constellation.',
          subtitle: 'People make connections. Connections make a whole universe.',
        },
        runner: {
          title: 'Mention pills',
          subtitle: '@halfin is going the distance. Your mentions can take a shortcut.',
        },
      }[panel.id];
  }
}

function PostLeaf({ post, source }: { post: WorldPost; source: WorldData['source'] }) {
  return (
    <article className={styles.postCard}>
      <div className={styles.postAuthor}>
        <span className={styles.miniAvatar}>
          <Leaf size={17} />
        </span>
        <div>
          <strong>{post.author}</strong>
          <span>{source === 'demo' ? 'Fictional example post' : 'Public production post'}</span>
        </div>
      </div>
      <p className={styles.postText}>{post.text}</p>
      <div className={styles.postTags}>
        {post.tags.map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
      {post.url?.startsWith('/post/') ? (
        <Link href={post.url} className={styles.textLink} target="_blank" rel="noopener noreferrer">
          Read on Pubky production
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      ) : (
        <ExternalWorldLink href={post.url} className={styles.textLink}>
          Read on Pubky production
        </ExternalWorldLink>
      )}
    </article>
  );
}

function ArenaGame() {
  const [wins, setWins] = useState(0);
  const [result, setResult] = useState('The champion is ready. The champion is a duck.');
  const choices = [
    { label: 'Rock', Icon: Orbit },
    { label: 'Paper', Icon: Hand },
    { label: 'Scissors', Icon: Scissors },
  ];
  function play(choice: number) {
    const duck = window.crypto.getRandomValues(new Uint8Array(1))[0] % choices.length;
    const outcome = (choice - duck + 3) % 3;
    if (outcome === 1) setWins((count) => count + 1);
    setResult(
      `You chose ${choices[choice].label.toLowerCase()}. Quack chose ${choices[duck].label.toLowerCase()}. ${outcome === 0 ? 'A draw. Suspiciously similar thinking.' : outcome === 1 ? 'You win! The duck has requested a rematch.' : 'Quack wins. Try not to let it go to his beak.'}`,
    );
  }
  return (
    <div className={styles.arenaGame}>
      <div className={styles.champion}>
        <span aria-hidden="true">🦆</span>
        <div>
          <span className={styles.eyebrow}>LOCAL MINI-GAME</span>
          <h3>Rock. Paper. Quack.</h3>
          <p>Just you and one very competitive duck.</p>
        </div>
      </div>
      <div className={styles.gameChoices}>
        {choices.map(({ label, Icon }, index) => (
          <Button key={label} overrideDefaults className={styles.gameChoice} onClick={() => play(index)}>
            <Icon size={29} />
            <span>{label}</span>
          </Button>
        ))}
      </div>
      <p className={styles.gameResult} role="status">
        {result}
      </p>
      <div className={styles.gameScore}>
        <Trophy size={17} />
        <strong>{wins}</strong> {wins === 1 ? 'glorious victory' : 'glorious victories'} this visit
      </div>
    </div>
  );
}

function TrendingShow({
  data,
  loading,
  index,
  paused,
  canPlay,
  onPause,
  onStep,
}: {
  data: WorldData;
  loading: boolean;
  index: number;
  paused: boolean;
  canPlay: boolean;
  onPause: (paused: boolean) => void;
  onStep: (delta: number) => void;
}) {
  const posts = data.trendingPosts;
  const postIndex = posts.length ? ((index % posts.length) + posts.length) % posts.length : 0;
  const post = posts[postIndex];
  return (
    <div className={styles.theaterPanel} aria-busy={loading}>
      <div className={styles.theaterMarquee}>
        <Theater size={27} aria-hidden="true" />
        <div>
          <strong>{loading ? 'Setting the stage.' : 'The feed has taken the stage.'}</strong>
          <span>
            {!loading && data.source === 'demo'
              ? 'Example program · fictional posts'
              : 'Public production · ranked by total engagement'}
          </span>
        </div>
      </div>
      {loading ? (
        <div className={styles.theaterLoading} role="status" aria-label="Loading trending posts">
          <LoaderCircle size={36} className={styles.spin} aria-hidden="true" />
          <h3>Loading trending posts…</h3>
          <p>The next program is on its way from public production.</p>
        </div>
      ) : post ? (
        <>
          <div className={styles.theaterTransport} role="group" aria-label="Trending show controls">
            <Button
              overrideDefaults
              className={styles.theaterStep}
              aria-label="Previous trending post"
              disabled={posts.length < 2}
              onClick={() => onStep(-1)}
            >
              <ArrowLeft size={18} />
            </Button>
            <Button
              overrideDefaults
              className={styles.theaterPlay}
              onClick={() => onPause(!paused)}
              disabled={posts.length < 2 || !canPlay}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
              {paused ? 'Resume show' : 'Pause show'}
            </Button>
            <Button
              overrideDefaults
              className={styles.theaterStep}
              aria-label="Next trending post"
              disabled={posts.length < 2}
              onClick={() => onStep(1)}
            >
              <ArrowRight size={18} />
            </Button>
            <span className={styles.theaterCounter} role="status">
              {String(postIndex + 1).padStart(2, '0')} / {String(posts.length).padStart(2, '0')}
            </span>
          </div>
          <PostLeaf post={post} source={data.source} />
          <p className={styles.smallPrint}>
            {!canPlay
              ? 'Use the arrows to browse while the 3D screen is unavailable.'
              : paused
                ? 'The show is paused so you can read.'
                : 'A new post takes the stage every 20 seconds.'}{' '}
            Skipping pauses the show. Heckling is between you and the duck.
          </p>
        </>
      ) : (
        <div className={styles.theaterEmpty}>
          <Theater size={36} aria-hidden="true" />
          <h3>The stage is taking a breather.</h3>
          <p>No public trending posts are available in this sample. You can refresh public posts in World settings.</p>
        </div>
      )}
      {!loading && (
        <p className={styles.smallPrint}>
          {data.source === 'demo'
            ? 'The program is loading from public production.'
            : 'This program uses Pubky’s Hot feed ranking, without a date filter.'}
        </p>
      )}
    </div>
  );
}

function WorldPanel({
  panel,
  data,
  loading,
  onSelect,
  onDance,
  onJump,
  onTravel,
  social,
  directory,
  onVisitPerson,
  onSignIn,
  theaterIndex,
  theaterPaused,
  theaterCanPlay,
  onTheaterPause,
  onTheaterStep,
}: {
  panel: WorldInteraction;
  data: WorldData;
  loading: boolean;
  onSelect: (panel: Panel) => void;
  onDance: () => void;
  onJump: () => void;
  onTravel: (zone: WorldZoneId, options?: { faceLandmark?: boolean }) => void;
  social: WorldSocialState;
  directory: {
    query: string;
    scope: WorldDirectoryScope;
    page: number;
    onQuery: (value: string) => void;
    onScope: (scope: WorldDirectoryScope) => void;
    onPage: (page: number) => void;
  };
  onVisitPerson: (id: string) => void;
  onSignIn: () => void;
  theaterIndex: number;
  theaterPaused: boolean;
  theaterCanPlay: boolean;
  onTheaterPause: (paused: boolean) => void;
  onTheaterStep: (delta: number) => void;
}) {
  if (panel.kind === 'portal')
    return (
      <div className={styles.funPanel}>
        <Orbit size={70} className={styles.portalIcon} />
        <p>Walk through the glowing ring and pop out at one of the other two portals. The destination is a surprise.</p>
        <p className={styles.smallPrint}>
          Step clear of the arrival ring before hopping again. Even wormholes need personal space.
        </p>
      </div>
    );
  if (panel.kind === 'social-cluster') return null;
  if (panel.kind === 'conference') return <WorldConferences index={panel.index} />;
  if (panel.kind === 'post') {
    const post = data.tags[panel.tagIndex]?.posts[panel.postIndex];
    return (
      <>
        <Button
          overrideDefaults
          className={styles.backLink}
          onClick={() => onSelect({ kind: 'tag', index: panel.tagIndex })}
        >
          <ArrowLeft size={15} />
          Back to the tree
        </Button>
        {post ? (
          <PostLeaf post={post} source={data.source} />
        ) : (
          <p>This leaf is no longer in the current sample. Try another tree.</p>
        )}
      </>
    );
  }
  if (panel.kind === 'tag') {
    const tag = data.tags[panel.index];
    return (
      <>
        <div className={styles.sectionLabel}>
          <Leaf size={14} />
          {tag?.posts.length ?? 0} {data.source === 'demo' ? 'example leaves' : 'sampled posts'}
        </div>
        <div className={styles.postList}>
          {tag?.posts.map((post) => (
            <PostLeaf key={post.id} post={post} source={data.source} />
          ))}
          {!tag?.posts.length && <p>No post leaves are available for this tree yet.</p>}
        </div>
      </>
    );
  }
  if (panel.kind === 'person') {
    const person = data.people.find((item) => item.id === panel.id);
    if (!person) return <p>This person is no longer in this circle. Browse the plaza to find someone else.</p>;
    const latestPost = social.profile.latestPost;
    return (
      <WorldPersonPanel
        person={person}
        social={social}
        post={latestPost ? <PostLeaf post={latestPost} source={data.source} /> : null}
        onSignIn={onSignIn}
        onVisit={onVisitPerson}
      />
    );
  }
  if (panel.kind === 'fun') {
    if (panel.id === 'graph')
      return (
        <div className={styles.funPanel}>
          <Orbit size={64} className={styles.portalIcon} />
          <blockquote>Every hello adds another star.</blockquote>
          <p>
            The sculpture at the center celebrates the graph itself: a web of people, follows, and unexpected
            introductions. Zoom out and explore the bigger picture.
          </p>
          <ExternalWorldLink href={WORLD_EXPERIMENTS.graph.url} className={styles.primaryButton}>
            {WORLD_EXPERIMENTS.graph.action}
          </ExternalWorldLink>
        </div>
      );
    if (panel.id === 'runner')
      return (
        <div className={styles.funPanel}>
          <span className={styles.mentionPill}>@halfin</span>
          <blockquote>Names that keep up with your thoughts.</blockquote>
          <p>
            Pick someone from autocomplete and their name snaps into a neat mention pill. Your sentence keeps its
            stride, without a 52-character key barging into the middle.
          </p>
          <p>
            Changed your mind? One press of Backspace clears the whole pill. Our resident runner approves of fewer
            hurdles.
          </p>
          <ExternalWorldLink href={WORLD_EXPERIMENTS.runner.url} className={styles.primaryButton}>
            {WORLD_EXPERIMENTS.runner.action}
          </ExternalWorldLink>
        </div>
      );
    if (panel.id === 'tether')
      return (
        <div className={styles.satoshiPanel}>
          <blockquote>A solid place to contemplate new ventures.</blockquote>
          <p>A sculptural tribute to Tether, standing in its own garden at the northern edge of the island.</p>
          <ExternalWorldLink href="https://tether.io/ventures/" className={styles.textLink}>
            Explore Tether Ventures
          </ExternalWorldLink>
        </div>
      );
    if (panel.id === 'bank')
      return (
        <div className={styles.satoshiPanel}>
          <span className={styles.brrrWordmark} aria-hidden="true">
            BRRR
          </span>
          <blockquote>Unlimited supply. Extremely limited shelf life.</blockquote>
          <p>
            The printer never clocks out. Fresh dollars take a long ride on the wind. Some settle at your feet before
            evaporating, one bill at a time. Finally, a bank with transparent assets.
          </p>
          <p className={styles.smallPrint}>
            Find the Brrr Bank on the east side of the island. The bills are decorative confetti. The printer’s noise is
            just a sign; your speakers can relax.
          </p>
          <Button
            overrideDefaults
            className={styles.primaryButton}
            onClick={() => onTravel('bitkit', { faceLandmark: true })}
          >
            Where can I get Hard Money?
            <ArrowRight size={18} />
          </Button>
        </div>
      );
    if (panel.id === 'satoshi')
      return (
        <div className={styles.satoshiPanel}>
          <span className={styles.satoshiWordmark} aria-hidden="true">
            ₿
          </span>
          <blockquote>Identity: unknown. Impact: everywhere.</blockquote>
          <p>
            Walk around the hooded figure. Its separated steel plates catch the light, then slip out of view as you
            change angle. Even the statue is practicing privacy.
          </p>
          <p className={styles.smallPrint}>
            An original 3D tribute inspired by Valentina Picozzi’s Satoshi Nakamoto monument in Lugano: a seated figure,
            a laptop, and a disappearing silhouette.
          </p>
          <ExternalWorldLink href="https://satsymbol.org/" className={styles.textLink}>
            Explore the Satoshi symbol
          </ExternalWorldLink>
          <ExternalWorldLink
            href="https://tether.io/news/plan-b-initiative-unveils-satoshi-nakamoto-statue-at-3rd-annual-plan-forum-in-lugano/"
            className={styles.textLink}
          >
            The story of Lugano’s monument
          </ExternalWorldLink>
          <p className={styles.smallPrint}>
            Find the sculpture beside Social Plaza, on the path toward Pubky University.
          </p>
        </div>
      );
    if (panel.id === 'duck')
      return (
        <div className={styles.funPanel}>
          <span className={styles.funEmoji} aria-hidden="true">
            🦆
          </span>
          <blockquote>“I have decentralized my ducks. They are now everywhere and refuse to form a row.”</blockquote>
          <p>He appears to be waiting for you to dance. It is unclear whether this is official pond policy.</p>
          <Button overrideDefaults className={styles.primaryButton} onClick={onDance}>
            Do the permissionless dance
            <Sparkles size={17} />
          </Button>
        </div>
      );
    if (panel.id === 'trampoline')
      return (
        <div className={styles.funPanel}>
          <span className={styles.funEmoji} aria-hidden="true">
            🚀
          </span>
          <p>The ground called. It says you should see other altitudes.</p>
          <Button overrideDefaults className={styles.primaryButton} onClick={onJump}>
            Investigate the sky
            <MoveUp size={18} />
          </Button>
        </div>
      );
    return null;
  }
  if (panel.id === 'forest')
    return (
      <>
        <div className={styles.sectionLabel}>
          <TreePine size={15} />
          {data.source === 'demo' ? 'An example grove' : 'A sample of public production tags'}
        </div>
        <div className={styles.tagGrid}>
          {data.tags.map((tag, index) => (
            <Button
              key={tag.label}
              overrideDefaults
              className={styles.tagCard}
              onClick={() => onSelect({ kind: 'tag', index })}
            >
              <TreePine size={26} />
              <strong>#{tag.label}</strong>
              <span>
                {tag.posts.length} {data.source === 'demo' ? 'example leaves' : 'sampled posts'}
              </span>
              <ArrowUpRight size={16} />
            </Button>
          ))}
        </div>
        <p className={styles.smallPrint}>
          A post can grow on more than one tree. Tags connect ideas across the forest.
        </p>
      </>
    );
  if (panel.id === 'plaza')
    return (
      <>
        <WorldPeopleDirectory
          people={data.people}
          social={social}
          {...directory}
          onSelect={(id) => onSelect({ kind: 'person', id })}
          onSignIn={onSignIn}
        />
        <Button
          overrideDefaults
          className={styles.monumentLink}
          onClick={() => onSelect({ kind: 'fun', id: 'satoshi' })}
        >
          <span aria-hidden="true">₿</span>
          <span>
            <strong>The Satoshi monument</strong>
            <small>A familiar stranger beside the plaza.</small>
          </span>
          <ChevronRight size={18} />
        </Button>
      </>
    );
  if (panel.id === 'arena')
    return (
      <>
        <ExternalWorldLink href={WORLD_EXPERIMENTS.arena.url} className={styles.primaryButton}>
          {WORLD_EXPERIMENTS.arena.action}
        </ExternalWorldLink>
        <ArenaGame />
        <Button overrideDefaults className={styles.monumentLink} onClick={() => onSelect({ kind: 'fun', id: 'bank' })}>
          <span aria-hidden="true">$</span>
          <span>
            <strong>The Brrr Bank</strong>
            <small>Our neighbor has a printing problem.</small>
          </span>
          <ChevronRight size={18} />
        </Button>
      </>
    );
  if (panel.id === 'chess')
    return (
      <div className={styles.funPanel}>
        <span className={styles.chessEmblem} aria-hidden="true">
          ♞
        </span>
        <blockquote>The knights are taller than you. Your opening can still be stronger.</blockquote>
        <p>
          Thirty-two giants guard this board. Wander between the obsidian and silver ranks, then challenge someone to a
          game on Chessky.
        </p>
        <ExternalWorldLink href={WORLD_EXPERIMENTS.chess.url} className={styles.primaryButton}>
          {WORLD_EXPERIMENTS.chess.action}
        </ExternalWorldLink>
      </div>
    );
  if (panel.id === 'cinema') return <WorldCinema />;
  if (panel.id === 'conferences') return <WorldConferences />;
  if (panel.id === 'theater')
    return (
      <TrendingShow
        data={data}
        loading={loading}
        index={theaterIndex}
        paused={theaterPaused}
        canPlay={theaterCanPlay}
        onPause={onTheaterPause}
        onStep={onTheaterStep}
      />
    );
  if (panel.id === 'university')
    return (
      <>
        <div className={styles.sectionLabel}>
          <BookOpen size={15} />
          Five short lessons. Zero student debt.
        </div>
        <div className={styles.articleList}>
          {UNIVERSITY_ARTICLES.map((article, index) => (
            <article className={styles.lessonCard} key={article.url}>
              <span className={styles.lessonNumber}>0{index + 1}</span>
              <div>
                <h3>{article.title}</h3>
                <p>{article.description}</p>
                <ExternalWorldLink href={article.url} className={styles.textLink}>
                  Read the full lesson
                </ExternalWorldLink>
              </div>
            </article>
          ))}
        </div>
        <p className={styles.smallPrint}>Original short summaries of the official documentation at pubky.org.</p>
      </>
    );
  if (panel.id === 'github')
    return (
      <>
        <div className={styles.sectionLabel}>
          <Github size={15} />
          Built in the open · github.com/pubky
        </div>
        <div className={styles.projectGrid}>
          {GITHUB_PROJECTS.map((project, index) => (
            <article className={styles.projectCard} key={project.url}>
              <span className={styles.projectNumber}>/{String(index + 1).padStart(2, '0')}</span>
              <h3>{project.title}</h3>
              <p>{project.description}</p>
              <ExternalWorldLink href={project.url} className={styles.textLink}>
                Open workshop
              </ExternalWorldLink>
            </article>
          ))}
        </div>
      </>
    );
  return (
    <div className={styles.bitkitPanel}>
      <div className={styles.bitkitMark}>
        <Bitkit size={150} aria-label="Bitkit" />
      </div>
      <h3>Big logo. Your keys.</h3>
      <p>
        Bitkit is a self-custodial Bitcoin and Lightning wallet. The beacon is a playful landmark celebrating the same
        idea as this world: keep control of what is yours.
      </p>
      <ExternalWorldLink href="https://bitkit.to/" className={styles.primaryButton}>
        Meet Bitkit
      </ExternalWorldLink>
      <span className={styles.smallPrint}>An experimental community world. No wallet connection is required.</span>
    </div>
  );
}

export function World() {
  const { isFullyAuthenticated, isLoading: isAuthLoading } = useAuthStatus();
  const { data: baseData, status: dataStatus, error: dataError, loadProduction } = useWorldData();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [socialView, setSocialView] = useState<WorldSocialView>({ sector: null, page: 0 });
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryScope, setDirectoryScope] = useState<WorldDirectoryScope>('all');
  const [directoryPage, setDirectoryPage] = useState(0);
  const [directoryIds, setDirectoryIds] = useState<string[]>([]);
  const social = useWorldSocial({
    enabled: true,
    selectedId: panel?.kind === 'person' ? panel.id : null,
    directoryIds,
  });
  const { requireAuth } = useRequireAuth();
  const personal = baseData.source === 'production' && Boolean(social.viewerId);
  const data: WorldData = personal
    ? { ...baseData, people: social.people, relationships: social.relationships }
    : baseData;
  const firstLoad = useRef(loadProduction);
  const autoActorRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<WorldController | null>(null);
  const initialData = useRef(data);
  const dataLoadingRef = useRef(dataStatus === 'loading');
  const [sceneState, setSceneState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [welcome, setWelcome] = useState(true);
  const [overview, setOverview] = useState(true);
  const [showMap, setShowMap] = useState(true);
  const [night, setNight] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [personaColor, setPersonaColor] = useState(PERSONA_COLORS[0]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [worldStatus, setWorldStatus] = useState<WorldStatus>(INITIAL_STATUS);

  useEffect(() => {
    if (isAuthLoading) return;
    const enterRequested = consumeWorldEntry();
    if (!isFullyAuthenticated || !enterRequested) return;
    setWelcome(false);
    setOverview(false);
    containerRef.current?.focus({ preventScroll: true });
  }, [isFullyAuthenticated, isAuthLoading]);

  useEffect(() => {
    if (autoActorRef.current === social.viewerId) return;
    autoActorRef.current = social.viewerId;
    setPanel(null);
    setSocialView({ sector: null, page: 0 });
    setDirectoryQuery('');
    setDirectoryPage(0);
    setDirectoryScope('all');
  }, [social.viewerId]);

  useEffect(() => {
    void firstLoad.current();
  }, []);

  useEffect(() => {
    const visible =
      panel?.kind === 'zone' && panel.id === 'plaza'
        ? worldDirectoryPage(data.people, directoryQuery, directoryScope, directoryPage).people
        : socialViewPeople(data.people, socialView).slice(0, 20);
    const nextIds = visible.map((person) => person.id);
    setDirectoryIds((current) => (current.join(',') === nextIds.join(',') ? current : nextIds));
  }, [data.people, panel, socialView, directoryQuery, directoryScope, directoryPage]);

  useEffect(() => {
    let cancelled = false;
    let controller: WorldController | null = null;
    setSceneState('loading');
    void import('@/libs/world/world-scene')
      .then(({ createWorld }) => {
        if (cancelled || !containerRef.current) return;
        controller = createWorld(containerRef.current, {
          data: initialData.current,
          onInteract: (interaction) => {
            if (!cancelled) {
              if (interaction.kind === 'social-cluster') {
                setSocialView({ sector: interaction.sector, page: 0 });
                setWelcome(false);
                setOverview(false);
                controller?.travelTo('plaza');
                return;
              }
              controller?.setPaused(true);
              setPanel(interaction);
            }
          },
          onStatus: (nextStatus) => {
            if (!cancelled) setWorldStatus(nextStatus);
          },
          onReady: () => {
            if (!cancelled) setSceneState('ready');
          },
          onExplore: () => {
            if (!cancelled) {
              setWelcome(false);
              setOverview(false);
            }
          },
        });
        controllerRef.current = controller;
        controller.setTheaterLoading(dataLoadingRef.current);
        controller.setOverview(true);
        controller.setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      })
      .catch(() => {
        if (!cancelled) setSceneState('error');
      });
    return () => {
      cancelled = true;
      controller?.dispose();
      controllerRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    const currentData = personal
      ? { ...baseData, people: social.people, relationships: social.relationships }
      : baseData;
    initialData.current = currentData;
    controllerRef.current?.updateData(currentData);
  }, [baseData, personal, social.people, social.relationships]);
  useEffect(() => {
    controllerRef.current?.setSocialView(socialView);
  }, [socialView, sceneState]);
  useEffect(() => {
    controllerRef.current?.setSocialFocus(panel?.kind === 'person' ? panel.id : null);
  }, [panel, sceneState]);
  useEffect(() => {
    dataLoadingRef.current = dataStatus === 'loading';
    controllerRef.current?.setTheaterLoading(dataLoadingRef.current);
  }, [dataStatus]);
  useEffect(() => {
    controllerRef.current?.setPaused(panel !== null || cameraOpen);
  }, [panel, cameraOpen, sceneState]);
  useEffect(() => {
    if (panel?.kind === 'zone' && panel.id === 'theater') {
      controllerRef.current?.setTheaterPaused(true);
      setWorldStatus((current) => ({ ...current, theaterPaused: true }));
    }
  }, [panel, sceneState]);
  useEffect(() => {
    controllerRef.current?.setNight(night);
  }, [night, sceneState]);
  useEffect(() => {
    controllerRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion, sceneState]);
  useEffect(() => {
    controllerRef.current?.setPersonaColor(personaColor);
  }, [personaColor, sceneState]);
  useEffect(() => {
    controllerRef.current?.setOverview(overview);
  }, [overview, sceneState]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const zone = WORLD_ZONES.find((item) => item.id === worldStatus.zone) ?? WORLD_ZONES[0];
  const heading = panel ? panelHeading(panel, data) : null;
  const socialPages = socialViewPageCount(data.people, socialView);
  const socialPage = Math.min(socialView.page, socialPages - 1);

  function wander() {
    setWelcome(false);
    setOverview(false);
    containerRef.current?.focus({ preventScroll: true });
  }
  function selectPanel(nextPanel: Panel) {
    controllerRef.current?.setPaused(true);
    setPanel(nextPanel);
  }
  function travelTo(destination: WorldZoneId, options?: { faceLandmark?: boolean }) {
    setWelcome(false);
    setOverview(false);
    setPanel(null);
    controllerRef.current?.setPaused(false);
    if (sceneState === 'error') {
      selectPanel({ kind: 'zone', id: destination });
      return;
    }
    if (options) controllerRef.current?.travelTo(destination, options);
    else controllerRef.current?.travelTo(destination);
    containerRef.current?.focus({ preventScroll: true });
  }
  function visitPerson(id: string) {
    const view = socialViewForPerson(data.people, id);
    if (!view) return;
    setSocialView(view);
    setWelcome(false);
    setOverview(false);
    setPanel(null);
    controllerRef.current?.setPaused(false);
    controllerRef.current?.travelToPerson(id);
    containerRef.current?.focus({ preventScroll: true });
  }
  function signInToFollow() {
    requireAuth(() => undefined);
  }
  function move(x: number, z: number) {
    if (!panel) controllerRef.current?.setMove(x, z);
  }
  function pauseTheater(paused: boolean) {
    controllerRef.current?.setTheaterPaused(paused);
    setWorldStatus((current) => ({ ...current, theaterPaused: paused }));
  }
  function stepTheater(delta: number) {
    pauseTheater(true);
    if (controllerRef.current) {
      controllerRef.current.stepTheater(delta);
    } else {
      const count = data.trendingPosts.length;
      setWorldStatus((current) => ({
        ...current,
        theaterIndex: count ? (((current.theaterIndex + delta) % count) + count) % count : 0,
      }));
    }
  }
  function perform(action: 'dance' | 'jump') {
    setPanel(null);
    setWelcome(false);
    setOverview(false);
    controllerRef.current?.setPaused(false);
    controllerRef.current?.[action]();
  }

  return (
    <main
      className={styles.world}
      data-testid="pubky-world"
      data-world-x={worldStatus.position[0].toFixed(2)}
      data-world-z={worldStatus.position[1].toFixed(2)}
      data-world-zone={worldStatus.zone}
    >
      <div
        ref={containerRef}
        className={styles.canvas}
        tabIndex={0}
        aria-label="Interactive Pubky island. Use W A S D or arrow keys to walk, space to jump, E to interact. Drag to orbit the camera."
      />
      <div className={styles.vignette} aria-hidden="true" />

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <PubkyIcon size={26} />
          </span>
          <span>
            pubky<span className={styles.brandWorld}>world</span>
          </span>
          <span className={styles.experiment}>EXPERIMENT</span>
        </div>
        <div className={styles.topActions}>
          <div className={styles.identity}>
            <span className={styles.identityFace} style={{ background: personaColor }}>
              ••
            </span>
            <div>
              <strong>{social.viewerId ? 'Your Pubky persona' : 'Curious explorer'}</strong>
              <span>{social.viewerId ? 'Your social circle' : 'Guest persona'}</span>
            </div>
          </div>
        </div>
      </header>

      {dataError && (
        <div className={styles.dataNotice} role="status">
          <Info size={15} />
          <span>{dataError}</span>
          <Button
            overrideDefaults
            aria-label="Retry production data"
            disabled={dataStatus === 'loading'}
            onClick={() => void loadProduction()}
          >
            Retry production
          </Button>
        </div>
      )}

      {welcome && (
        <section className={styles.welcome}>
          <div className={styles.welcomeEyebrow}>
            <span />
            SMALL WORLD. OPEN POSSIBILITIES.
          </div>
          <h1>
            Your social world.
            <br />
            <span>A little more alive.</span>
          </h1>
          <p>
            Follow a connection. Pick a post from a tree.
            <br className={styles.desktopBreak} /> Take the scenic route through Pubky.
          </p>
          <div className={styles.welcomeActions}>
            {isAuthLoading ? (
              <Button overrideDefaults className={styles.primaryButton} disabled>
                Restoring your session…
                <LoaderCircle size={19} aria-hidden="true" />
              </Button>
            ) : isFullyAuthenticated ? (
              <Button overrideDefaults className={styles.primaryButton} onClick={wander}>
                Enter your world
                <ArrowRight size={19} aria-hidden="true" />
              </Button>
            ) : (
              <>
                <Link href={AUTH_ROUTES.SIGN_IN} className={styles.primaryButton}>
                  Sign in and explore
                  <ArrowRight size={19} aria-hidden="true" />
                </Link>
                <Button overrideDefaults className={styles.guestButton} onClick={wander}>
                  Explore as a guest
                </Button>
              </>
            )}
          </div>
          <div className={styles.welcomeFootnote}>
            <Footprints size={14} />
            {isFullyAuthenticated && !isAuthLoading
              ? 'Your people. Your corner of the world.'
              : 'Sign in to find your people. Guests are welcome, too.'}
          </div>
        </section>
      )}

      {sceneState !== 'ready' && (
        <div className={`${styles.loadingCard} ${sceneState === 'error' ? styles.errorCard : ''}`} role="status">
          {sceneState === 'loading' ? (
            <>
              <span className={styles.loadingOrbit}>
                <Orbit size={30} />
              </span>
              <strong>Growing your little world…</strong>
              <p>Planting ideas. Waking the duck.</p>
            </>
          ) : (
            <>
              <Compass size={30} />
              <strong>The island needs a different view.</strong>
              <p>Your browser could not start the 3D scene. You can still read the tag forest while you try again.</p>
              <div className={styles.fallbackActions}>
                <Button
                  overrideDefaults
                  className={styles.primaryButton}
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Try 3D again
                  <ArrowRight size={16} />
                </Button>
                <Button
                  overrideDefaults
                  className={styles.secondaryButton}
                  onClick={() => selectPanel({ kind: 'zone', id: 'forest' })}
                >
                  Browse the forest
                  <BookOpen size={16} />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {!welcome && (
        <div className={styles.location}>
          <span className={styles.locationDot} />
          <div>
            <small>YOU FOUND YOURSELF IN</small>
            <strong>{zone.name}</strong>
          </div>
          <Button
            overrideDefaults
            aria-label={`Explore ${zone.name}`}
            onClick={() => selectPanel({ kind: 'zone', id: zone.id })}
          >
            <ArrowUpRight size={20} />
          </Button>
        </div>
      )}

      {showMap && !welcome && (
        <aside className={styles.minimap} aria-label="Island map">
          <div className={styles.mapHeader}>
            <span>THE LITTLE BIG PICTURE</span>
            <span>N ↑</span>
          </div>
          <div className={styles.mapIsland}>
            <svg viewBox="0 0 180 130" aria-hidden="true">
              <path d="M30 14 113 8 159 37 171 90 120 120 39 112 9 67Z" />
              <path
                d={WORLD_ZONES.filter((destination) => destination.id !== 'plaza')
                  .map(
                    (destination) =>
                      `M${(50 + MAP_CENTER[0] * MAP_SCALE) * 1.8} ${(48 + MAP_CENTER[1] * MAP_SCALE) * 1.3} L${(50 + destination.position[0] * MAP_SCALE) * 1.8} ${(48 + destination.position[1] * MAP_SCALE) * 1.3}`,
                  )
                  .join(' ')}
              />
            </svg>
            {WORLD_ZONES.map((destination) => (
              <span
                role="img"
                className={styles.mapPoint}
                key={destination.id}
                style={{
                  left: `${50 + destination.position[0] * MAP_SCALE}%`,
                  top: `${48 + destination.position[1] * MAP_SCALE}%`,
                  background: destination.color,
                }}
                aria-label={destination.name}
                title={destination.name}
              />
            ))}
            <span
              className={styles.mapPlayer}
              style={{
                left: `${50 + worldStatus.position[0] * MAP_SCALE}%`,
                top: `${48 + worldStatus.position[1] * MAP_SCALE}%`,
              }}
              aria-label="Your position"
            />
          </div>
          <div className={styles.mapCaption}>
            <span className={styles.playerDot} />
            You, here and now<small>{worldStatus.collected} discoveries</small>
          </div>
        </aside>
      )}

      {!welcome && !panel && !cameraOpen && worldStatus.zone === 'plaza' && (
        <aside className={styles.socialHud} aria-label="Social plaza view">
          <div className={styles.socialHudLegend}>
            <span>
              <i className={styles.followingMarker} />
              {personal ? `${social.directCount.toLocaleString()} following` : 'Public profiles'}
            </span>
            {personal && (
              <span>
                <i className={styles.discoveryMarker} />
                {social.discoveryCount.toLocaleString()} one hop away
              </span>
            )}
          </div>
          {social.status === 'loading' && personal && (
            <span className={styles.socialHudStatus}>
              <LoaderCircle size={12} className={styles.spin} />
              Discovering your circle…
            </span>
          )}
          {social.status === 'paused' && personal && (
            <Button overrideDefaults className={styles.textLink} onClick={social.loadMore}>
              Continue discovering
              <ArrowRight size={13} />
            </Button>
          )}
          {socialView.sector !== null && data.people.length > SOCIAL_PAGE_SIZE && (
            <div className={styles.socialPaging} role="group" aria-label="Neighborhood pages">
              <Button
                overrideDefaults
                aria-label="Previous neighborhood page"
                disabled={socialPage === 0}
                onClick={() => setSocialView({ ...socialView, page: socialPage - 1 })}
              >
                <ArrowLeft size={15} />
              </Button>
              <span>
                Neighborhood {socialView.sector + 1} · {socialPage + 1}/{socialPages}
              </span>
              <Button
                overrideDefaults
                aria-label="Next neighborhood page"
                disabled={socialPage + 1 >= socialPages}
                onClick={() => setSocialView({ ...socialView, page: socialPage + 1 })}
              >
                <ArrowRight size={15} />
              </Button>
              <Button
                overrideDefaults
                aria-label="Show all social neighborhoods"
                onClick={() => setSocialView({ sector: null, page: 0 })}
              >
                <Orbit size={16} />
              </Button>
            </div>
          )}
          {!personal && (
            <Button overrideDefaults className={styles.textLink} onClick={signInToFollow}>
              Sign in to see your circle
            </Button>
          )}
        </aside>
      )}

      {worldStatus.nearby && !welcome && !panel && (
        <Button overrideDefaults className={styles.interactPrompt} onClick={() => controllerRef.current?.interact()}>
          <kbd>E</kbd>
          <span>{worldStatus.nearby}</span>
          <MousePointer2 size={15} />
        </Button>
      )}

      <div className={styles.touchControls} aria-label="Touch movement controls">
        <div className={styles.directionPad}>
          {[
            { label: 'Walk forward', x: 0, z: -1, Icon: ArrowUp, area: 'up' },
            { label: 'Walk left', x: -1, z: 0, Icon: ArrowLeft, area: 'left' },
            { label: 'Walk backward', x: 0, z: 1, Icon: ArrowDown, area: 'down' },
            { label: 'Walk right', x: 1, z: 0, Icon: ArrowRight, area: 'right' },
          ].map(({ label, x, z, Icon, area }) => (
            <Button
              overrideDefaults
              key={label}
              aria-label={label}
              style={{ gridArea: area }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                setWelcome(false);
                setOverview(false);
                move(x, z);
              }}
              onPointerUp={() => move(0, 0)}
              onPointerCancel={() => move(0, 0)}
              onLostPointerCapture={() => move(0, 0)}
            >
              <Icon size={20} />
            </Button>
          ))}
        </div>
        <Button
          overrideDefaults
          className={styles.touchJump}
          aria-label="Jump"
          onClick={() => {
            setWelcome(false);
            setOverview(false);
            controllerRef.current?.jump();
          }}
        >
          <MoveUp size={21} />
          <span>JUMP</span>
        </Button>
      </div>

      <footer className={styles.bottomBar}>
        <div className={styles.worldStamp}>
          <Orbit size={15} />
          <span>AN OPEN WEB, WITH ROOM TO WANDER.</span>
        </div>
        <div className={styles.movementHelp}>
          <span>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd>Walk
          </span>
          <span>
            <MousePointer2 size={14} />
            Drag to orbit
          </span>
          <span>
            <kbd>SPACE</kbd>Jump
          </span>
          <span>
            <kbd>E</kbd>Interact
          </span>
        </div>
        <div className={styles.viewControls}>
          <WorldCamera
            disabled={sceneState !== 'ready' || panel !== null}
            onCapture={() => controllerRef.current?.capturePhoto() ?? Promise.resolve(null)}
            onOpenChange={setCameraOpen}
            onReturnFocus={() => containerRef.current?.focus({ preventScroll: true })}
          />
          <Button
            overrideDefaults
            aria-label={overview ? 'Follow my persona' : 'Show island overview'}
            aria-pressed={overview}
            title={overview ? 'Follow my persona' : 'Island overview'}
            onClick={() => {
              setOverview(!overview);
              setWelcome(false);
            }}
          >
            <Orbit size={18} />
          </Button>
          <Button
            overrideDefaults
            aria-label={showMap ? 'Hide minimap' : 'Show minimap'}
            aria-pressed={showMap}
            title="Toggle minimap"
            onClick={() => setShowMap(!showMap)}
          >
            <Map size={18} />
          </Button>
          <Button
            overrideDefaults
            aria-label={night ? 'Switch to daytime' : 'Switch to nighttime'}
            aria-pressed={night}
            title={night ? 'Daytime' : 'Nighttime'}
            onClick={() => setNight(!night)}
          >
            {night ? <Moon size={18} /> : <Sun size={18} />}
          </Button>
          <span />
          <Button
            overrideDefaults
            aria-label="World settings"
            title="Make yourself at home"
            onClick={() => selectPanel({ kind: 'settings' })}
          >
            <Settings2 size={18} />
          </Button>
        </div>
      </footer>

      <Dialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent
          overrideDefaults
          showCloseButton={false}
          className={styles.dialog}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            containerRef.current?.focus({ preventScroll: true });
          }}
        >
          <DialogClose asChild>
            <Button overrideDefaults className={styles.closeButton} aria-label="Close and return to world">
              <X size={20} />
            </Button>
          </DialogClose>
          <div className={styles.dialogEyebrow}>
            <Orbit size={14} />
            {panel?.kind === 'settings'
              ? 'YOUR WORLD, YOUR WAY'
              : panel?.kind === 'zone' && (panel.id === 'university' || panel.id === 'github' || panel.id === 'bitkit')
                ? 'A LITTLE PUBKY EXPLORATION'
                : personal
                  ? 'YOUR PUBKY CIRCLE · PRODUCTION'
                  : 'PUBLIC PRODUCTION'}
          </div>
          <DialogTitle className={styles.dialogTitle}>{heading?.title ?? 'Explore the world'}</DialogTitle>
          <DialogDescription className={styles.dialogDescription}>{heading?.subtitle}</DialogDescription>
          {panel?.kind === 'settings' ? (
            <div className={styles.settingsPanel}>
              <div className={styles.settingRow}>
                <div>
                  <strong>Moonlight mode</strong>
                  <p>Same world. A different kind of glow.</p>
                </div>
                <Switch aria-label="Moonlight mode" checked={night} onCheckedChange={setNight} />
              </div>
              <div className={styles.settingRow}>
                <div>
                  <strong>Quieter motion</strong>
                  <p>Reduce decorative animation and camera motion.</p>
                </div>
                <Switch aria-label="Reduce motion" checked={reducedMotion} onCheckedChange={setReducedMotion} />
              </div>
              <div className={styles.settingRow}>
                <div>
                  <strong>Pocket map</strong>
                  <p>A small reminder of where everything is.</p>
                </div>
                <Switch aria-label="Show pocket map" checked={showMap} onCheckedChange={setShowMap} />
              </div>
              <div className={styles.colorSetting}>
                <strong>Your sneaker glow</strong>
                <div className={styles.colorChoices}>
                  {PERSONA_COLORS.map((color, index) => (
                    <Button
                      overrideDefaults
                      key={color}
                      className={styles.colorChoice}
                      style={{ background: color }}
                      aria-label={`Sneaker glow ${['lime', 'orange', 'violet', 'cyan', 'pink'][index]}`}
                      aria-pressed={color === personaColor}
                      onClick={() => setPersonaColor(color)}
                    >
                      {color === personaColor && <Check size={20} />}
                    </Button>
                  ))}
                </div>
              </div>
              <div className={styles.settingNote}>
                <VolumeX size={18} />
                <p>This world is quiet by design. Your imaginary footsteps are your own.</p>
              </div>
              <Button
                overrideDefaults
                className={styles.secondaryButton}
                disabled={dataStatus === 'loading'}
                onClick={() => void loadProduction()}
              >
                {dataStatus === 'loading' ? 'Loading public posts…' : 'Refresh public posts'}
              </Button>
              <Button overrideDefaults className={styles.secondaryButton} onClick={() => perform('dance')}>
                Test your new look with a dance
                <Sparkles size={16} />
              </Button>
            </div>
          ) : (
            panel && (
              <WorldPanel
                panel={panel}
                data={data}
                loading={dataStatus === 'loading'}
                onSelect={selectPanel}
                onDance={() => perform('dance')}
                onJump={() => perform('jump')}
                onTravel={travelTo}
                social={social}
                directory={{
                  query: directoryQuery,
                  scope: directoryScope,
                  page: directoryPage,
                  onQuery: (query) => {
                    setDirectoryQuery(query);
                    setDirectoryPage(0);
                  },
                  onScope: (scope) => {
                    setDirectoryScope(scope);
                    setDirectoryPage(0);
                  },
                  onPage: setDirectoryPage,
                }}
                onVisitPerson={visitPerson}
                onSignIn={signInToFollow}
                theaterIndex={worldStatus.theaterIndex}
                theaterPaused={worldStatus.theaterPaused}
                theaterCanPlay={sceneState === 'ready'}
                onTheaterPause={pauseTheater}
                onTheaterStep={stepTheater}
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
