import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import type { WorldArticle, WorldData, WorldPost, WorldZone } from '@/libs/world/world-types';

export const WORLD_ZONES: WorldZone[] = [
  {
    id: 'plaza',
    name: 'Social Plaza',
    subtitle: 'A constellation of connections',
    description: 'People are little worlds. Follow the glowing threads and find out how theirs connect.',
    color: '#C8FF03',
    position: [...WORLD_ANCHORS.plaza],
  },
  {
    id: 'forest',
    name: 'Tag Forest',
    subtitle: 'Ideas grow on trees here',
    description: 'Every tree is a tag. Every leaf is a post. Wander between ideas and pick something good to read.',
    color: '#94C954',
    position: [...WORLD_ANCHORS.forest],
  },
  {
    id: 'arena',
    name: 'The Arena',
    subtitle: 'Extremely unserious competition',
    description: 'A very grand arena for very small victories. Challenge the local champion to rock, paper, scissors.',
    color: '#E98154',
    position: [...WORLD_ANCHORS.arena],
  },
  {
    id: 'university',
    name: 'Pubky University',
    subtitle: 'Stay curious. Keep your keys.',
    description:
      'A tiny campus for big ideas: identity, your data, and a web you can leave without leaving yourself behind.',
    color: '#AA8BCD',
    position: [...WORLD_ANCHORS.university],
  },
  {
    id: 'github',
    name: 'Open Source Yard',
    subtitle: 'Some assembly encouraged',
    description:
      'Meet the projects that make Pubky possible. Every workshop has an open door and a link to its source.',
    color: '#71BEAA',
    position: [...WORLD_ANCHORS.github],
  },
  {
    id: 'bitkit',
    name: 'Bitkit Beacon',
    subtitle: 'A rather large orange idea',
    description: 'A monument to keeping your bitcoin in your own hands. Also a very good place to stand dramatically.',
    color: '#FF7040',
    position: [...WORLD_ANCHORS.bitkit],
  },
  {
    id: 'theater',
    name: 'Trending Theater',
    subtitle: 'Big ideas. Bigger screen.',
    description: 'Take a seat under the stars. The public Hot feed takes the stage, one post at a time.',
    color: '#C8FF03',
    position: [...WORLD_ANCHORS.theater],
  },
];

/** Original sample content: these personas and posts do not represent real Pubky users. */
const DEMO_POSTS: WorldPost[] = [
  {
    id: 'demo:1',
    author: 'Moss Boss',
    text: 'Moved my entire social life into a tree. The branches have excellent reach.',
    tags: ['nature', 'pubky'],
  },
  {
    id: 'demo:2',
    author: 'Captain Quack',
    text: 'The pond has no algorithm. It does, however, have opinions about bread.',
    tags: ['nature', 'memes'],
  },
  {
    id: 'demo:3',
    author: 'Professor Keys',
    text: 'Today’s field trip: touch grass, then discuss who owns the grass database.',
    tags: ['nature', 'ideas'],
  },
  {
    id: 'demo:4',
    author: 'Bug Whisperer',
    text: 'Found a bug in the forest. Finally, one I am allowed to leave alone.',
    tags: ['nature', 'opensource'],
  },
  {
    id: 'demo:5',
    author: 'Captain Quack',
    text: 'I have decentralized my ducks. They are now everywhere and refuse to form a row.',
    tags: ['memes', 'pubky'],
  },
  {
    id: 'demo:6',
    author: 'Satoshi Sprout',
    text: 'My investment thesis is a bench in the sun and a very good sandwich.',
    tags: ['memes', 'bitcoin'],
  },
  {
    id: 'demo:7',
    author: 'Disco Node',
    text: 'The dance floor is permissionless. My dancing probably should require permission.',
    tags: ['memes', 'ideas'],
  },
  {
    id: 'demo:8',
    author: 'Professor Keys',
    text: 'Your identity is a key. This is why I have seventeen degrees and still check every pocket.',
    tags: ['pubky', 'ideas'],
  },
  {
    id: 'demo:9',
    author: 'Moss Boss',
    text: 'A home for my data, a tree for my thoughts. Feeling suspiciously well organized.',
    tags: ['pubky', 'opensource'],
  },
  {
    id: 'demo:10',
    author: 'Satoshi Sprout',
    text: 'Planted a seed and waited. Apparently, proof of growth takes its own sweet time.',
    tags: ['bitcoin', 'nature'],
  },
  {
    id: 'demo:11',
    author: 'Captain Quack',
    text: 'The best thing about self-custody is that nobody can confiscate my emergency snack fund.',
    tags: ['bitcoin', 'memes'],
  },
  {
    id: 'demo:12',
    author: 'Disco Node',
    text: 'Lightning-fast payments. Pigeon-speed decision making at the sandwich counter.',
    tags: ['bitcoin', 'ideas'],
  },
  {
    id: 'demo:13',
    author: 'Bug Whisperer',
    text: 'Opened the source. A tiny mechanic waved back. Pretty sure that is a feature.',
    tags: ['opensource', 'memes'],
  },
  {
    id: 'demo:14',
    author: 'Professor Keys',
    text: 'Homework: build something useful. Extra credit: give it unnecessarily tiny wheels.',
    tags: ['opensource', 'ideas'],
  },
  {
    id: 'demo:15',
    author: 'Moss Boss',
    text: 'Anyone want to start a reading club where the books are leaves and the librarian is a duck?',
    tags: ['ideas', 'nature'],
  },
];

export const DEMO_WORLD_DATA: WorldData = {
  source: 'demo',
  // A fictional theater program, replaced entirely when public staging loads.
  trendingPosts: DEMO_POSTS.slice(0, 8),
  tags: ['pubky', 'nature', 'bitcoin', 'memes', 'opensource', 'ideas'].map((label) => {
    const posts = DEMO_POSTS.filter((post) => post.tags.includes(label)).slice(0, 5);
    return { label, count: posts.length, posts };
  }),
  people: [
    {
      id: 'moss',
      name: 'Moss Boss',
      color: '#C8FF03',
      bio: 'Botanical overthinker. Runs this entirely fictional forest’s most exclusive compost club.',
      position: [-6, 5],
    },
    {
      id: 'quack',
      name: 'Captain Quack',
      color: '#EFC34A',
      bio: 'Demo pond administrator. Has never read the terms of service. Has eaten them.',
      position: [3, 3],
    },
    {
      id: 'keys',
      name: 'Professor Keys',
      color: '#A085C5',
      bio: 'Fictional professor of applied curiosity. Tenure is stored on a homeserver.',
      position: [7, 8],
    },
    {
      id: 'sprout',
      name: 'Satoshi Sprout',
      color: '#E2834E',
      bio: 'A made-up gardener of orange ideas. Carries snacks and extremely patient optimism.',
      position: [3, 14],
    },
    {
      id: 'bug',
      name: 'Bug Whisperer',
      color: '#61B8AF',
      bio: 'Sample open-source tinkerer. Fixes one bug. Befriends two more.',
      position: [-4, 14],
    },
    {
      id: 'disco',
      name: 'Disco Node',
      color: '#CE7196',
      bio: 'Demo dance enthusiast. Connected to the beat, occasionally connected to the internet.',
      position: [-8, 10],
    },
  ],
  relationships: [
    { from: 'moss', to: 'quack', label: 'follows' },
    { from: 'quack', to: 'moss', label: 'follows' },
    { from: 'keys', to: 'bug', label: 'follows' },
    { from: 'bug', to: 'keys', label: 'follows' },
    { from: 'sprout', to: 'keys', label: 'follows' },
    { from: 'disco', to: 'quack', label: 'follows' },
    { from: 'moss', to: 'bug', label: 'follows' },
    { from: 'disco', to: 'sprout', label: 'follows' },
  ],
};

/** Short, original summaries of the linked official documentation. */
export const UNIVERSITY_ARTICLES: WorldArticle[] = [
  {
    title: 'Keys 101',
    description:
      'Your public key identifies you across Pubky apps. A homeserver holds your data, and apps discover that data through your public key. Think of it as your own front door to the web.',
    url: 'https://pubky.org/tldr/',
  },
  {
    title: 'Escape Artist School',
    description:
      'Credible exit means you can change providers while keeping your identity, data, and connections. Leaving should be practical, too. You should not need to start your digital life over to try a different home.',
    url: 'https://pubky.org/explore/concepts/credible-exit/',
  },
  {
    title: 'The Friendship Constellation',
    description:
      'Tags add meaning to connections between people and content. Relevance and weighted relationships help people shape what they see. A social graph can say more than simply who follows whom.',
    url: 'https://pubky.org/explore/concepts/semantic-social-graph/',
  },
  {
    title: 'Address Astronomy',
    description:
      'PKDNS resolves domains based on public keys. PKARR publishes signed DNS records through the Mainline DHT so clients can discover services. Your key is the signpost; the homeserver is where your data lives.',
    url: 'https://pubky.org/explore/technologies/pkdns/',
  },
  {
    title: 'A Web You Can Build On',
    description:
      'Pubky apps read and write data on homeservers using common interfaces. An app can be a small browser experiment, use an aggregator for discovery, or bring its own backend. The interface is yours to imagine.',
    url: 'https://pubky.org/explore/pubky-apps/app-architectures/introduction/',
  },
];

export const GITHUB_PROJECTS: WorldArticle[] = [
  {
    title: 'pubky-app',
    description: 'The social clubhouse: Pubky’s web frontend, and the starting point for this experimental world.',
    url: 'https://github.com/pubky/pubky-app',
  },
  {
    title: 'pubky-homeserver',
    description:
      'The moving-house workshop. Stores and serves user data, with SDKs and a local testnet for builders. Previously named pubky-core.',
    url: 'https://github.com/pubky/pubky-homeserver',
  },
  {
    title: 'pubky-nexus',
    description:
      'The connection observatory. Aggregates homeserver events into a social graph and API for social clients.',
    url: 'https://github.com/pubky/pubky-nexus',
  },
  {
    title: 'pkarr',
    description: 'The address antenna. Publishes and resolves signed DNS records using public-key identities.',
    url: 'https://github.com/pubky/pkarr',
  },
  {
    title: 'pkdns',
    description: 'The extremely helpful signpost. A DNS server that resolves PKARR domains.',
    url: 'https://github.com/pubky/pkdns',
  },
  {
    title: 'pubky-ring',
    description: 'The keyring carousel. Manages Pubky identities and lets you authorize and revoke app access.',
    url: 'https://github.com/pubky/pubky-ring',
  },
  {
    title: 'pubky-docker',
    description: 'The tiny container yard. Runs a local Pubky stack for development and experimentation.',
    url: 'https://github.com/pubky/pubky-docker',
  },
  {
    title: 'paykit-rs',
    description:
      'The experimental payment post office. Helps apps discover and exchange payment details through Pubky. Work in progress.',
    url: 'https://github.com/pubky/paykit-rs',
  },
];
