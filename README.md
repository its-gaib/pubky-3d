[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/pubky/pubky-app)

# Pubky World

A dark, playful 3D fork of Pubky: walk through a forest of tags, follow the social
constellation, or catch the Trending Theater's rotating Hot-feed show. Visit Pubky
University, the builders' yard, the Satoshi monument, and a bank that prints fading
dollar confetti. Take a world photo and bring it into Pubky's post composer.

The world lives at `/`; the familiar Pubky feed is at `/home`. Start with the
fictional example world or opt into a sample of public staging content.

See [the world guide](docs/world/README.md) for controls, local preview, sources,
architecture and the future multiplayer boundary. The fork point is recorded in
[fork.json](docs/world/fork.json). No vibe registry PR has been opened.

# Upstream Pubky web app

## Prerequisites

- Node.js (see [.nvmrc](./.nvmrc) for the recommended version)

## Getting Started

First, install the dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Copy the example environment file and adjust the values as needed:

```bash
cp .env.example .env
```

See [docs/environment.md](./docs/environment.md) for more details.

## Common Workflows

- Check architecture and coding conventions: [docs/README.md](./docs/README.md)
- Run local code review workflow (Cursor): use `/review` (defined in `.cursor/skills/code-review/SKILL.md`)
- Follow commit message format: [docs/commit-message.md](./docs/commit-message.md)

## License

This project is licensed under the MIT License.  
See the [LICENSE](./LICENSE) file for more details.
