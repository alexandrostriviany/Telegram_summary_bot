# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Serverless Telegram bot that generates AI-powered summaries of group chat conversations. Built with TypeScript, deployed on AWS Lambda via SAM, stores messages in DynamoDB with 72-hour TTL auto-cleanup.

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

**Request flow:** Telegram webhook → API Gateway → Lambda handler (`src/handler.ts`) → routes by message type:
- `new_chat_members` with bot → sends welcome message
- Commands (`/summary`, `/help`) → `CommandRouter` → specific handler
- Text messages (including photo captions) → stored in DynamoDB
- Everything else (stickers, media without caption) → ignored

**Key modules:**
- `src/handler.ts` — Lambda entry point, webhook routing, singleton caching of clients for cold-start optimization
- `src/commands/command-router.ts` — Routes commands to registered handlers
- `src/commands/summary-handler.ts` — Parses `/summary` parameters (time-based like `2h` or count-based like `50`, default 24h)
- `src/summary/summary-engine.ts` — Hierarchical chunking of messages for large conversations, calls AI provider
- `src/summary/summary-formatter.ts` — Formats raw AI output for Telegram (Markdown)
- `src/store/message-store.ts` — DynamoDB operations (store, query by time range or count)
- `src/ai/ai-provider.ts` — Factory for AI providers; `openai-provider.ts` (GPT-3.5-turbo) and `bedrock-provider.ts` (Claude 3 Haiku)
- `src/telegram/telegram-client.ts` — Telegram Bot API HTTP client
- `src/errors/error-handler.ts` — Error sanitization (strips API keys/tokens from user-facing messages)

**Design patterns:**
- Singleton: Lambda-level cached clients (`cachedTelegramClient`, `cachedMessageStore`) for cross-invocation reuse
- Strategy: `AIProvider` interface with OpenAI and Bedrock implementations
- Factory functions for dependency injection (`createCommandRouter`, `createSummaryHandler`, etc.)

**DynamoDB schema:** Partition key `chatId` (Number), sort key `timestamp` (Number). TTL attribute `expireAt` auto-deletes after 72 hours.

**Infrastructure:** Defined in `template.yaml` (AWS SAM). Parameters include `TelegramBotToken`, `OpenAIApiKey`, `LLMProvider` (openai|bedrock), `MessageTTLHours`, `DefaultSummaryHours`.

## Testing

- Uses Jest with ts-jest preset and fast-check for property-based tests
- Coverage threshold: 70% globally (branches, functions, lines, statements)
- Test timeout: 30s (accommodates property-based tests with 100+ iterations)
- Tests are co-located: `src/**/*.test.ts` and additional tests in `tests/`
- Sample Lambda events in `events/` directory for local invocation

## Build Details

- esbuild bundles `src/handler.ts` into single `dist/handler.js`
- AWS SDK packages (`@aws-sdk/*`) are externalized (provided by Lambda runtime)
- `node-fetch` v2 is used (CommonJS-compatible) for Telegram API calls
