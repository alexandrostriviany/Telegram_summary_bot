# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Serverless Telegram bot that generates AI-powered summaries of group chat conversations. Supports both in-group summaries and private per-group summaries via forum topics. Built with TypeScript, deployed on AWS Lambda via SAM, stores messages in DynamoDB with 72-hour TTL auto-cleanup. Per-user daily credit system controls usage.

## Commands

```bash
# Install dependencies
npm install

# Build (TypeScript compile only)
npm run build

# Bundle for production (minified + source maps)
npm run bundle:prod

# Run all tests
npm test

# Run a single test file
npx jest src/commands/command-router.test.ts

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report (70% threshold enforced)
npm run test:coverage

# Lint
npm run lint

# Local development with DynamoDB Local
docker-compose up -d          # Start DynamoDB Local on port 8001
npm run sam:local              # Invoke Lambda locally with default event

# Deploy
npm run deploy:guided          # First-time interactive deploy
npm run deploy                 # Standard deploy (uses samconfig.toml)
npm run register-webhook       # Register webhook URL with Telegram
```

## Architecture

**Runtime:** AWS Lambda (Node.js 18, ARM64, 128MB) behind HTTP API Gateway v2 (POST /webhook).

**Request flow:** Telegram webhook → API Gateway → Lambda handler (`src/handler.ts`) → routes by update type:
- Callback query (inline button press) → `handleCallbackQuery()` → link/unlink/menu/nav handlers
- `new_chat_members` with bot → sends welcome message + deep-link button, records chat ownership
- `forum_topic_created` in private chat → suggests `/link`
- Keyboard button press (private chat) → rewrites to slash command, routes through `CommandRouter`
- Commands (`/summary`, `/help`, `/start`, etc.) → `CommandRouter` → specific handler
- Text messages (including photo captions) → stored in DynamoDB + passive user-group tracking
- Everything else (stickers, media without caption) → ignored

**Key modules:**

| Module | Purpose |
|--------|---------|
| `src/handler.ts` | Lambda entry point, webhook routing, singleton caching, callback query routing, cold-start initialization (registers bot commands, fetches bot info) |
| `src/commands/command-router.ts` | Routes `/command args` to registered handlers; strips bot mentions (`/cmd@BotName`) |
| `src/commands/summary-handler.ts` | Parses `/summary` parameters (time `2h`/`30m`, count `50`, default 24h); handles group, private, and private-topic contexts; checks credits |
| `src/commands/start-handler.ts` | Private: onboarding welcome + reply keyboard + creates user credit record; Group: brief acknowledgement; Deep link: auto-trigger linking flow (`/start link_<chatId>`) |
| `src/commands/help-handler.ts` | Context-aware help (compact for groups, full for private) |
| `src/commands/credits-handler.ts` | Shows invoking user's remaining daily credits |
| `src/commands/link-handler.ts` | Links a group to a private forum topic; verifies membership; shows inline keyboard of candidate groups |
| `src/commands/unlink-handler.ts` | Removes a group link with confirmation keyboard |
| `src/commands/groups-handler.ts` | Lists all linked groups with active/closed status |
| `src/commands/admin-handler.ts` | Admin-only: `setcredits <userId> <limit>`, `getuser <userId>` |
| `src/summary/summary-engine.ts` | Fetch messages → format → estimate tokens → hierarchical chunking if needed → call AI → return summary |
| `src/summary/summary-formatter.ts` | Parses AI JSON output into Telegram HTML with topic headings and blockquotes |
| `src/store/message-store.ts` | DynamoDB message storage with 72h TTL; query by time range, count, or forum topic |
| `src/store/credits-store.ts` | Per-user daily credit tracking with atomic consumption and midnight UTC auto-reset; chat ownership mapping; `userExists()` check for unregistered users |
| `src/store/topic-link-store.ts` | Maps private forum topics to group chats (userId + topicThreadId → groupChatId); GSI on groupChatId |
| `src/store/user-group-store.ts` | Passive tracking of which users appear in which groups (for candidate group discovery) |
| `src/services/membership-service.ts` | Verifies group membership via Telegram `getChatMember` API |
| `src/ai/ai-provider.ts` | Strategy interface + factory for AI providers |
| `src/ai/openai-provider.ts` | OpenAI GPT implementation |
| `src/ai/bedrock-provider.ts` | AWS Bedrock Claude implementation |
| `src/ai/gemini-provider.ts` | Google Gemini implementation |
| `src/ai/prompts.ts` | System prompts for summarization |
| `src/ai/token-usage-logger.ts` | Per-call token usage logging |
| `src/telegram/telegram-client.ts` | Telegram Bot API HTTP client (messages, inline keyboards, forum topics, chat membership, command registration) |
| `src/errors/error-handler.ts` | Centralized error mapping with custom error classes; strips API keys from user-facing messages |
| `src/types.ts` | Core TypeScript interfaces for Telegram API types and storage types |

**Design patterns:**
- **Singleton:** Lambda-level cached clients (`cachedTelegramClient`, `cachedMessageStore`, `cachedCreditsStore`, `cachedTopicLinkStore`, `cachedUserGroupStore`, `cachedMembershipService`, `cachedBotUser`) for cross-invocation reuse; `resetCachedInstances()` for testing
- **Strategy:** `AIProvider` interface with OpenAI, Bedrock, and Gemini implementations; selected at runtime via `LLM_PROVIDER`
- **Factory:** `create*Handler()` functions for dependency injection
- **Command Router:** Map of command name → handler; parses `/cmd args` and strips bot mentions
- **Callback routing:** Prefixed callback data (`link:`, `unlink:confirm:`, `menu:`, `nav:`) multiplexes button types through a single handler
- **Atomic credits:** DynamoDB conditional update (`creditsUsedToday < dailyLimit`) prevents race conditions

**Credit system:**
- Each user has a daily credit limit (default 10, configurable per-user via admin)
- Credits auto-reset at midnight UTC via `lastResetDate` comparison
- In group chats, the **invoking user** pays their own credits (not the group owner)
- Users must `/start` the bot in DM first to create a credit record before using `/summary` in groups
- `userExists()` checks for unregistered users without auto-creating records

**Private topic summary flow:**
1. User adds bot to group → bot sends deep-link button (`/start link_<chatId>`)
2. User clicks deep link → creates private forum topic linked to the group
3. User sends `/summary` in the private topic → handler looks up link → verifies membership → charges user's credits → summarizes group messages → sends to private topic
4. If user leaves group → access revoked, topic closed

## DynamoDB Tables

| Table | Partition Key | Sort Key | TTL | GSI | Purpose |
|-------|--------------|----------|-----|-----|---------|
| Messages | `chatId` (N) | `timestamp` (N) | `expireAt` (72h) | — | Store text messages for summarization |
| User Credits | `userId` (N) | — | — | — | Daily credit tracking, auto-reset |
| Chat Ownership | `chatId` (N) | — | — | — | Maps group → user who added the bot |
| Topic Links | `userId` (N) | `topicThreadId` (N) | — | `GroupChatIndex` (PK: `groupChatId`, SK: `userId`) | Private topic ↔ group mappings |
| User Groups | `userId` (N) | `groupChatId` (N) | — | — | Passive user-group tracking |

**Infrastructure:** Defined in `template.yaml` (AWS SAM). Key parameters: `TelegramBotToken`, `OpenAIApiKey`, `GeminiApiKey`, `LLMProvider` (openai|bedrock|gemini), `LLMModel`, `MessageTTLHours`, `DefaultSummaryHours`, `AdminUserId`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from BotFather |
| `LLM_PROVIDER` | Yes | AI provider: `openai`, `bedrock`, or `gemini` |
| `OPENAI_API_KEY` | If openai | OpenAI API key |
| `GEMINI_API_KEY` | If gemini | Google Gemini API key |
| `LLM_MODEL` | No | Model override (provider default if empty) |
| `DYNAMODB_TABLE` | No | Messages table name |
| `CREDITS_TABLE` | No | User credits table name |
| `CHAT_OWNERSHIP_TABLE` | No | Chat ownership table name |
| `TOPIC_LINKS_TABLE` | No | Topic links table name |
| `USER_GROUPS_TABLE` | No | User groups table name |
| `MESSAGE_TTL_HOURS` | No | TTL for messages (default: 72) |
| `DEFAULT_SUMMARY_HOURS` | No | Default summary window (default: 24) |
| `DEFAULT_DAILY_CREDITS` | No | Free tier daily limit (default: 10) |
| `ADMIN_USER_ID` | No | Telegram user ID for admin commands (0 = disabled) |
| `DYNAMODB_ENDPOINT` | No | Local DynamoDB endpoint (testing only) |

## Testing

- Uses Jest with ts-jest preset and fast-check for property-based tests
- Coverage threshold: 70% globally (branches, functions, lines, statements)
- Test timeout: 30s (accommodates property-based tests with 100+ iterations)
- Tests are co-located: `src/**/*.test.ts`
- Sample Lambda events in `events/` directory for local invocation
- Custom error classes (`NoMessagesError`, `CreditsExhaustedError`, `TopicNotLinkedError`, etc.) have dedicated test coverage

## Build Details

- esbuild bundles `src/handler.ts` into single `dist/handler.js`
- Target: Node.js 18, minified with source maps
- AWS SDK packages (`@aws-sdk/*`) are externalized (provided by Lambda runtime)
- `node-fetch` v2 is used (CommonJS-compatible) for Telegram API calls

## CI/CD

- **CI** (`.github/workflows/ci.yml`): Runs on push to all branches and PRs to main. Steps: lint → test → bundle:prod.
- **Deploy** (`.github/workflows/deploy.yml`): Runs on push to `main` or manual dispatch. Steps: CI → npm install → bundle:prod → SAM build → SAM deploy → register webhook → deploy monitoring stack.
- **Tail Logs** (`.github/workflows/tail-logs.yml`): Manual workflow for CloudWatch log debugging.
