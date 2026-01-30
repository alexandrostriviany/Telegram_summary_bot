#!/bin/bash
# Register Telegram webhook URL
# This script retrieves the webhook URL from CloudFormation outputs
# and registers it with the Telegram Bot API
#
# Usage:
#   ./scripts/register-webhook.sh                           # Use default stack name
#   ./scripts/register-webhook.sh --stack my-stack-name     # Use custom stack name
#   ./scripts/register-webhook.sh --url https://...         # Use explicit URL
#
# Environment variables:
#   TELEGRAM_BOT_TOKEN - Required: Telegram Bot API token

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
STACK_NAME="telegram-summary-bot"
WEBHOOK_URL=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --stack)
            STACK_NAME="$2"
            shift 2
            ;;
        --url)
            WEBHOOK_URL="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --stack NAME  CloudFormation stack name (default: telegram-summary-bot)"
            echo "  --url URL     Explicit webhook URL (skips CloudFormation lookup)"
            echo "  -h, --help    Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  TELEGRAM_BOT_TOKEN  Required: Telegram Bot API token"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Telegram Webhook Registration${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check for Telegram bot token
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo -e "${RED}Error: TELEGRAM_BOT_TOKEN environment variable is not set${NC}"
    echo ""
    echo "Set it using:"
    echo "  export TELEGRAM_BOT_TOKEN='your-bot-token'"
    echo ""
    echo "Get your token from @BotFather on Telegram"
    exit 1
fi

# Get webhook URL from CloudFormation if not provided
if [ -z "$WEBHOOK_URL" ]; then
    echo -e "${YELLOW}[1/3] Getting webhook URL from CloudFormation...${NC}"
    
    WEBHOOK_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --query "Stacks[0].Outputs[?OutputKey=='WebhookUrl'].OutputValue" \
        --output text 2>/dev/null)
    
    if [ -z "$WEBHOOK_URL" ] || [ "$WEBHOOK_URL" = "None" ]; then
        echo -e "${RED}Error: Could not retrieve webhook URL from stack '$STACK_NAME'${NC}"
        echo ""
        echo "Make sure:"
        echo "  1. The stack has been deployed successfully"
        echo "  2. The stack name is correct"
        echo ""
        echo "You can also provide the URL directly:"
        echo "  $0 --url https://your-api-gateway-url/webhook"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Found webhook URL: $WEBHOOK_URL${NC}"
else
    echo -e "${YELLOW}[1/3] Using provided webhook URL...${NC}"
    echo -e "${GREEN}✓ URL: $WEBHOOK_URL${NC}"
fi

# Register webhook with Telegram
echo ""
echo -e "${YELLOW}[2/3] Registering webhook with Telegram...${NC}"

TELEGRAM_API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"

RESPONSE=$(curl -s -X POST "${TELEGRAM_API}/setWebhook" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"${WEBHOOK_URL}\"}")

# Check if registration was successful
OK=$(echo "$RESPONSE" | grep -o '"ok":true' || true)

if [ -n "$OK" ]; then
    echo -e "${GREEN}✓ Webhook registered successfully${NC}"
else
    echo -e "${RED}Error: Failed to register webhook${NC}"
    echo "Response: $RESPONSE"
    exit 1
fi

# Verify webhook registration
echo ""
echo -e "${YELLOW}[3/3] Verifying webhook registration...${NC}"

WEBHOOK_INFO=$(curl -s "${TELEGRAM_API}/getWebhookInfo")

REGISTERED_URL=$(echo "$WEBHOOK_INFO" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
PENDING_COUNT=$(echo "$WEBHOOK_INFO" | grep -o '"pending_update_count":[0-9]*' | cut -d':' -f2)
LAST_ERROR=$(echo "$WEBHOOK_INFO" | grep -o '"last_error_message":"[^"]*"' | cut -d'"' -f4 || true)

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Webhook Registration Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Webhook Info:${NC}"
echo "  URL: $REGISTERED_URL"
echo "  Pending updates: ${PENDING_COUNT:-0}"

if [ -n "$LAST_ERROR" ]; then
    echo -e "  ${YELLOW}Last error: $LAST_ERROR${NC}"
fi

echo ""
echo -e "${BLUE}Your bot is now ready to receive messages!${NC}"
echo ""
echo "Test it by:"
echo "  1. Adding the bot to a Telegram group"
echo "  2. Sending a message in the group"
echo "  3. Using /help to see available commands"
echo ""
