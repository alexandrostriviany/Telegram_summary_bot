# Requirements Document

## Introduction

This document defines the requirements for a Telegram AI Summary Bot that helps users quickly understand missed discussions in Telegram group chats by generating concise AI-powered summaries. The bot is designed to be cost-effective (within AWS Free Tier), privacy-first, and support pluggable AI providers (OpenAI or AWS Bedrock/Claude).

## Glossary

- **Bot**: The Telegram bot application that receives messages and generates summaries
- **Summary_Engine**: The component responsible for orchestrating message retrieval and AI summarization
- **Message_Store**: The DynamoDB-based temporary storage for chat messages
- **AI_Provider**: An abstraction layer for LLM services (OpenAI or AWS Bedrock)
- **Webhook_Handler**: The Lambda function that processes incoming Telegram updates
- **TTL**: Time-To-Live, the automatic expiration mechanism for stored messages
- **Chat_ID**: Unique identifier for a Telegram group chat
- **Message_Range**: A time-based or count-based selection of messages for summarization

## Requirements

### Requirement 1: Bot Onboarding

**User Story:** As a group member, I want the bot to introduce itself when added to a group, so that I understand how to use it and what data it processes.

#### Acceptance Criteria

1. WHEN the Bot is added to a Telegram group, THE Bot SHALL send an introductory message explaining its purpose and commands
2. WHEN the Bot sends the introductory message, THE Bot SHALL include information about data usage and privacy
3. THE Bot SHALL only function in groups where Privacy Mode is disabled

### Requirement 2: Message Ingestion

**User Story:** As a group member, I want the bot to capture text messages in the group, so that it can summarize them later.

#### Acceptance Criteria

1. WHEN the Webhook_Handler receives a text message from Telegram, THE Message_Store SHALL store the message with chat_id, message_id, username, timestamp, and text
2. WHEN the Webhook_Handler receives a non-text message (sticker, media, join/leave notification), THE Webhook_Handler SHALL ignore the message without storing it
3. THE Message_Store SHALL set a TTL of 72 hours on each stored message
4. WHEN a message TTL expires, THE Message_Store SHALL automatically delete the message

### Requirement 3: Summary Command

**User Story:** As a group member, I want to request a summary of recent messages, so that I can quickly catch up on missed discussions.

#### Acceptance Criteria

1. WHEN a user issues the /summary command without parameters, THE Summary_Engine SHALL summarize messages from the default time window (last 24 hours)
2. WHEN a user issues /summary with a time parameter (e.g., /summary 1h), THE Summary_Engine SHALL summarize messages from the specified time range
3. WHEN a user issues /summary with a count parameter (e.g., /summary 50), THE Summary_Engine SHALL summarize the specified number of most recent messages
4. WHEN the Summary_Engine generates a summary, THE Bot SHALL format it with topic headers, bullet points, and open questions section
5. WHEN no messages are found in the specified range, THE Bot SHALL respond with a clear explanation

### Requirement 4: Help Command

**User Story:** As a group member, I want to view help information, so that I understand how to use the bot and its privacy practices.

#### Acceptance Criteria

1. WHEN a user issues the /help command, THE Bot SHALL respond with a list of available commands and their usage
2. WHEN a user issues the /help command, THE Bot SHALL include privacy information explaining data retention and usage

### Requirement 5: AI Provider Abstraction

**User Story:** As a bot admin, I want to choose between AI providers, so that I can optimize for cost or capability.

#### Acceptance Criteria

1. THE AI_Provider SHALL expose a common interface for summarization regardless of the underlying provider
2. WHEN the LLM_PROVIDER environment variable is set to "openai", THE AI_Provider SHALL use the OpenAI API
3. WHEN the LLM_PROVIDER environment variable is set to "bedrock", THE AI_Provider SHALL use AWS Bedrock with Claude
4. IF the AI_Provider fails to generate a summary, THEN THE Bot SHALL respond with a user-friendly error message

### Requirement 6: Long Conversation Handling

**User Story:** As a group member, I want summaries of long conversations, so that I can catch up even when there are many messages.

#### Acceptance Criteria

1. WHEN the message volume exceeds the AI provider's token limit, THE Summary_Engine SHALL split messages into chunks
2. WHEN messages are split into chunks, THE Summary_Engine SHALL summarize each chunk separately
3. WHEN chunk summaries are generated, THE Summary_Engine SHALL combine them into a final hierarchical summary

### Requirement 7: Security and Configuration

**User Story:** As a bot admin, I want secure handling of credentials, so that API keys and secrets are protected.

#### Acceptance Criteria

1. THE Bot SHALL retrieve API keys from encrypted Lambda environment variables
2. THE Bot SHALL use IAM roles with least-privilege permissions
3. THE Message_Store SHALL not be publicly accessible

### Requirement 8: Error Handling

**User Story:** As a group member, I want clear feedback when something goes wrong, so that I understand the issue.

#### Acceptance Criteria

1. IF the AI_Provider returns an error, THEN THE Bot SHALL respond with a user-friendly error message without exposing technical details
2. IF no messages are found for summarization, THEN THE Bot SHALL explain that no recent messages are available
3. IF token overflow occurs during summarization, THEN THE Summary_Engine SHALL use the hierarchical summarization fallback

### Requirement 9: Cost Optimization

**User Story:** As a bot admin, I want the bot to operate within AWS Free Tier, so that running costs are minimal.

#### Acceptance Criteria

1. THE Bot SHALL use serverless compute (AWS Lambda) to avoid always-on costs
2. THE Message_Store SHALL use DynamoDB with TTL to minimize storage costs
3. THE Bot SHALL use API Gateway for webhook handling to minimize infrastructure costs

### Requirement 10: Multi-Language Support

**User Story:** As a group member, I want summaries in the same language as the chat messages, so that I can understand them easily.

#### Acceptance Criteria

1. WHEN the Summary_Engine generates a summary, THE AI_Provider SHALL detect the language of the input messages
2. WHEN the AI_Provider detects the language, THE summary SHALL be written entirely in that language, including headers and labels
3. THE Bot SHALL NOT default to English if messages are in another language

### Requirement 11: Forward Attribution

**User Story:** As a group member, I want forwarded messages attributed to their original authors, so that I understand who proposed what.

#### Acceptance Criteria

1. WHEN the Webhook_Handler receives a forwarded message, THE Message_Store SHALL store the original author's name (forward_from, forward_sender_name, or forward_from_chat title)
2. WHEN the Summary_Engine formats messages for AI, THE forwarded messages SHALL be marked with "forwarded from [author]"
3. WHEN the AI_Provider generates a summary, THE summary SHALL attribute proposals and opinions to the original authors of forwarded messages
