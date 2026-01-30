# Implementation Plan: Telegram AI Summary Bot

## Overview

This implementation plan builds the Telegram AI Summary Bot as a serverless TypeScript application on AWS. The approach prioritizes core functionality first, then adds AI integration, and finally implements advanced features like hierarchical summarization.

## Tasks

- [ ] 1. Set up project structure and core types
  - [x] 1.1 Initialize TypeScript project with AWS Lambda configuration
    - Create package.json with dependencies (aws-sdk, node-fetch)
    - Configure tsconfig.json for ES2020 target
    - Set up esbuild for Lambda bundling
    - _Requirements: 9.1, 9.3_
  
  - [x] 1.2 Define core TypeScript interfaces
    - Create TelegramUpdate, Message, Chat, User interfaces
    - Create StoredMessage interface with thread fields
    - Create MessageQuery and MessageRange interfaces
    - _Requirements: 2.1, 3.2, 3.3_

- [ ] 2. Implement Message Store
  - [x] 2.1 Create DynamoDB message store implementation
    - Implement store() method with TTL calculation
    - Implement query() method with time and count filters
    - Implement deleteAll() method for chat cleanup
    - _Requirements: 2.1, 2.3_
  
  - [x] 2.2 Write property test for message storage completeness
    - **Property 1: Message Storage Completeness**
    - **Validates: Requirements 2.1**
  
  - [x] 2.3 Write property test for TTL configuration
    - **Property 3: TTL Configuration**
    - **Validates: Requirements 2.3**

- [ ] 3. Implement Webhook Handler
  - [x] 3.1 Create main Lambda handler function
    - Parse incoming Telegram updates
    - Route to appropriate handler based on update type
    - Handle bot added to group event
    - _Requirements: 1.1, 1.2, 2.1, 2.2_
  
  - [x] 3.2 Implement message filtering logic
    - Store only text messages
    - Ignore stickers, media, join/leave notifications
    - Extract thread context (replyToMessageId, threadId)
    - _Requirements: 2.2_
  
  - [x] 3.3 Write property test for non-text message filtering
    - **Property 2: Non-Text Message Filtering**
    - **Validates: Requirements 2.2**

- [x] 4. Checkpoint - Ensure message ingestion works
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement Command Router
  - [x] 5.1 Create command parsing and routing logic
    - Parse command and arguments from message text
    - Route /summary, /help commands to handlers
    - Handle unknown commands gracefully
    - _Requirements: 3.1, 3.2, 3.3, 4.1_
  
  - [x] 5.2 Implement /summary command parameter parsing
    - Parse time parameters (1h, 2h, 30m)
    - Parse count parameters (50, 100)
    - Default to 24 hours when no parameter
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [x] 5.3 Write property test for time parameter parsing
    - **Property 4: Time Parameter Parsing**
    - **Validates: Requirements 3.2**
  
  - [x] 5.4 Write property test for count parameter parsing
    - **Property 5: Count Parameter Parsing**
    - **Validates: Requirements 3.3**

- [ ] 6. Implement Telegram Client
  - [x] 6.1 Create Telegram Bot API client
    - Implement sendMessage() method
    - Handle API errors with retries
    - Format messages for Telegram (markdown support)
    - _Requirements: 1.1, 3.4, 3.5_

- [ ] 7. Implement AI Provider Abstraction
  - [x] 7.1 Create AI provider interface and factory
    - Define AIProvider interface with summarize() method
    - Implement provider factory based on LLM_PROVIDER env var
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [x] 7.2 Implement OpenAI provider
    - Use gpt-3.5-turbo for cost efficiency
    - Configure max_tokens and temperature
    - Handle API errors gracefully
    - _Requirements: 5.2, 5.4_
  
  - [x] 7.3 Implement Bedrock provider (Claude)
    - Use Claude 3 Haiku for cost efficiency
    - Configure inference parameters
    - Handle API errors gracefully
    - _Requirements: 5.3, 5.4_
  
  - [x] 7.4 Write property test for AI error handling
    - **Property 7: AI Error Handling**
    - **Validates: Requirements 5.4, 8.1**

- [x] 8. Checkpoint - Ensure AI providers work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Summary Engine
  - [x] 9.1 Create summary engine with message formatting
    - Fetch messages from store based on range
    - Format messages for AI prompt with thread context
    - Estimate token count for chunking decision
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [x] 9.2 Implement summary formatter
    - Format AI output with emoji headers (🧵)
    - Create bullet points for topics (•)
    - Add open questions section (❓)
    - _Requirements: 3.4_
  
  - [x] 9.3 Write property test for summary output formatting
    - **Property 6: Summary Output Formatting**
    - **Validates: Requirements 3.4**
  
  - [x] 9.4 Implement hierarchical summarization for long conversations
    - Split messages into chunks when exceeding token limit
    - Summarize each chunk separately
    - Combine chunk summaries into final summary
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 9.5 Write property test for hierarchical summarization
    - **Property 8: Hierarchical Summarization**
    - **Validates: Requirements 6.1, 6.2, 6.3, 8.3**

- [x] 10. Implement Help Command
  - [x] 10.1 Create /help command handler
    - List available commands with usage examples
    - Include privacy information about data retention
    - Format for Telegram readability
    - _Requirements: 4.1, 4.2_

- [x] 11. Implement Error Handling
  - [x] 11.1 Create centralized error handling
    - Define error types (NoMessagesError, AIProviderError, etc.)
    - Implement user-friendly error message mapping
    - Ensure no sensitive data in user responses
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 12. Checkpoint - Ensure all features work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Create AWS Infrastructure with SAM
  - [x] 13.1 Create SAM template for deployment
    - Define Lambda function with 128MB memory, ARM64
    - Create HTTP API Gateway with webhook route
    - Create DynamoDB table with TTL enabled
    - Configure IAM roles with least privilege
    - Set up CloudWatch logs with 7-day retention
    - _Requirements: 7.2, 9.1, 9.2, 9.3_
  
  - [x] 13.2 Create deployment scripts
    - Add sam build and sam deploy commands
    - Configure samconfig.toml for deployment settings
    - Add script to register Telegram webhook URL
    - _Requirements: 9.1_

- [x] 14. Final checkpoint - Integration testing
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are mandatory including property-based tests
- TypeScript with esbuild provides fast builds and small bundle sizes
- Property tests use fast-check library with 100 iterations minimum
- AI provider costs are the only non-free component (~$0.10-0.50/month for low traffic)

## Infrastructure Choice: AWS SAM

**Recommendation: AWS SAM** over CDK for this project because:

1. **Simpler for serverless**: SAM is purpose-built for Lambda + API Gateway + DynamoDB
2. **Less boilerplate**: Single YAML file vs multiple CDK constructs
3. **Local testing**: `sam local invoke` for testing Lambda locally
4. **Faster iteration**: No compilation step, just edit YAML and deploy
5. **Smaller footprint**: No CDK dependencies in your project

For a simple bot with 1 Lambda + 1 API Gateway + 1 DynamoDB table, SAM is the pragmatic choice.
