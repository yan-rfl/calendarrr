# CalendaRRR

A cross-platform calendar application with email sync, WhatsApp bot integration, and manual event management. Built with a modern monorepo structure using Turborepo, Next.js, and Expo.

## Workspace Structure

- **apps/web** – Next.js 15 web application for calendar management and email sync
- **apps/mobile** – Expo-based cross-platform mobile app (iOS/Android)
- **packages/types** – Shared TypeScript type definitions
- **packages/db** – Database schema and migrations
- **packages/utils** – Shared utility functions and helpers

## Tech Stack

- **Frontend**: Next.js 15 (web), Expo (mobile), React
- **Backend**: Node.js with Next.js API routes
- **Database**: (configured in packages/db)
- **Monorepo**: Turborepo
- **Language**: TypeScript
- **Package Manager**: pnpm

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+

### Installation

1. Clone the repository:
   ```sh
   git clone <repo-url>
   cd CalendaRRR
   ```

2. Install dependencies:
   ```sh
   pnpm install
   ```

3. Set up environment variables:
   ```sh
   cp .env.example .env.local
   ```
   Fill in the required values in `.env.local` (database credentials, email service API keys, WhatsApp bot token, etc.)

4. Start development servers:
   ```sh
   pnpm dev
   ```

## Implementation Phases

1. **Phase 1: Core Infrastructure** – Set up monorepo structure, database schema, and shared packages
2. **Phase 2: Email Sync** – Implement email integration for calendar event creation and synchronization
3. **Phase 3: WhatsApp Bot** – Develop WhatsApp bot for event management and notifications
4. **Phase 4: Mobile & Polish** – Complete Expo mobile app and refine user experience across platforms

## Development

Run all development servers with:
```sh
pnpm dev
```

Run a specific app or package:
```sh
pnpm dev --filter=web
pnpm dev --filter=mobile
```

Build all apps and packages:
```sh
pnpm build
```

## Resources

- [Turborepo Documentation](https://turborepo.dev)
- [Next.js Documentation](https://nextjs.org/docs)
- [Expo Documentation](https://docs.expo.dev)
