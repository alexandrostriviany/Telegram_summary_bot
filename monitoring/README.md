# CloudWatch Monitoring for Telegram Summary Bot

## Architecture Monitored

```
Telegram Webhook
      │
      ▼
 API Gateway (HTTP API v2)    ──▶  Dashboard: SystemOverview, Infrastructure
      │
      ▼
 Lambda (webhook-handler)     ──▶  Dashboard: SystemOverview, Infrastructure, Errors
      │
      ├─▶ DynamoDB PutItem        (message storage flow)
      │       │
      │       └──▶                 Dashboard: ApplicationFlow, Infrastructure
      │
      ├─▶ DynamoDB Query           (summary retrieval)
      │       │
      │       ▼
      │   AI Provider              (OpenAI GPT-3.5 / Bedrock Claude 3 Haiku)
      │       │
      │       └──▶                 Dashboard: ApplicationFlow, Errors
      │
      └─▶ Telegram sendMessage     (response delivery)
              │
              └──▶                 Dashboard: ApplicationFlow, Errors
```

## Dashboards

| Dashboard | Purpose | Key Signals |
|-----------|---------|-------------|
| **SystemOverview** | Executive health at a glance | API request count, 5xx rate, p90 latency, Lambda errors, DynamoDB capacity & throttles |
| **ApplicationFlow** | Business flow tracing | Webhook intake → messages stored → /summary commands → AI provider calls → error distribution by code |
| **Infrastructure** | Per-service deep dive | Lambda (invocations, errors, throttles, duration percentiles, cold starts), DynamoDB (capacity, throttles, latency by operation, returned item count), API Gateway (count, 4xx/5xx, latency vs integration latency) |
| **Errors** | Failure investigation | Lambda error rate %, application error code pie chart, AI provider errors by HTTP status, Telegram retry attempts, formatting issues, recent error log table |

## Alarms

| Alarm | Condition | Why It Matters |
|-------|-----------|----------------|
| `LambdaErrors-High` | > 5 errors in 5 min | Webhook processing failures; users don't get responses |
| `LambdaThrottles` | Any throttle | Telegram webhooks are being dropped entirely |
| `LambdaDuration-High` | p99 > 25s (timeout=30s) | Hierarchical summarization or slow AI provider near timeout |
| `ApiGateway-5xx` | > 3 in 5 min | Infrastructure failure (the app returns 200 even on errors, so 5xx = real infrastructure problem) |
| `DynamoDB-Throttles` | Any throttle | Message storage and summary queries impacted |
| `DynamoDB-SystemErrors` | Any system error | AWS-side DynamoDB failures |

## Deployment

### Option 1: Separate stack (recommended for independent lifecycle)

```bash
aws cloudformation deploy \
  --template-file monitoring/cloudwatch-monitoring.yaml \
  --stack-name telegram-bot-monitoring \
  --parameter-overrides \
    LambdaFunctionName=telegram-summary-bot-webhook-handler \
    HttpApiId=<your-api-id> \
    DynamoDBTableName=telegram-summary-bot-messages \
    AdminEmail=your-email@example.com
```

After deployment, **check your email inbox** and confirm the SNS subscription — AWS sends a confirmation link that must be clicked before alarm emails start arriving.

To find your `HttpApiId`, run:
```bash
aws cloudformation describe-stacks \
  --stack-name telegram-summary-bot \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
  --output text
# Extract the ID from https://<API_ID>.execute-api.<region>.amazonaws.com/prod
```

Or via API Gateway:
```bash
aws apigatewayv2 get-apis --query "Items[?Name=='TelegramBotApi'].ApiId" --output text
```

### Option 2: Nested stack from main template

Add to your `template.yaml` Resources section:
```yaml
MonitoringStack:
  Type: AWS::CloudFormation::Stack
  Properties:
    TemplateURL: monitoring/cloudwatch-monitoring.yaml
    Parameters:
      LambdaFunctionName: !Ref TelegramBotFunction
      HttpApiId: !Ref TelegramBotApi
      DynamoDBTableName: !Ref MessagesTable
      AdminEmail: your-email@example.com  # or '' to skip email alerts
```

## CloudWatch Logs Insights Queries

The dashboards use Logs Insights queries that parse the application's `console.log`/`console.error` output. Key patterns detected:

| Log Pattern | Source | Dashboard Widget |
|-------------|--------|-----------------|
| `Stored message:` | `handler.ts:203` | Messages Successfully Stored |
| `Received command:` | `handler.ts:154` | Bot Commands Received |
| `Bot added to group:` | `handler.ts:137` | Bot Added to Groups |
| `[ERROR_CODE] ErrorName:` | `error-handler.ts:372` | Error Distribution, Errors Over Time |
| `OpenAI API error:` | `openai-provider.ts:345` | AI Provider Errors |
| `Bedrock API error:` | `bedrock-provider.ts:329` | AI Provider Errors |
| `Telegram API call failed (attempt N/M):` | `telegram-client.ts:152` | Telegram API Retry Attempts |
| `HTML parsing failed` | `telegram-client.ts:161` | Telegram Formatting Issues |
| `Message truncated` | `telegram-client.ts:131` | Telegram Formatting Issues |
| `Init Duration:` | Lambda REPORT lines | Cold Starts & Init Duration |

## Recommended Custom Metrics

The application currently relies on console logging. For richer observability, consider emitting custom CloudWatch metrics via the [Embedded Metric Format](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format.html) (zero infrastructure cost, parsed from logs):

```typescript
// Example: add to summary-handler.ts after successful summary generation
console.log(JSON.stringify({
  "_aws": {
    "Timestamp": Date.now(),
    "CloudWatchMetrics": [{
      "Namespace": "TelegramSummaryBot",
      "Dimensions": [["Provider"]],
      "Metrics": [
        {"Name": "SummaryGenerated", "Unit": "Count"},
        {"Name": "SummaryDurationMs", "Unit": "Milliseconds"},
        {"Name": "MessagesInSummary", "Unit": "Count"}
      ]
    }]
  },
  "Provider": "openai",
  "SummaryGenerated": 1,
  "SummaryDurationMs": 2340,
  "MessagesInSummary": 87
}));
```

Suggested custom metrics:
- `SummaryGenerated` – count of successful summaries (by provider)
- `SummaryDurationMs` – end-to-end summary generation time
- `MessagesInSummary` – number of messages included per summary
- `ChunksUsed` – hierarchical summarization chunk count (> 1 = large conversation)
- `MessageStored` – count of stored messages (by chat type: group/supergroup)
- `TokensEstimated` – estimated token count per AI call (cost monitoring)

## Cost

CloudWatch dashboards cost $3/month each (4 dashboards = $12/month). Standard metrics and the first 5 alarms are included in free tier. Logs Insights queries are charged at $0.0076/GB scanned. With 7-day log retention and low traffic, expect < $1/month for queries.
