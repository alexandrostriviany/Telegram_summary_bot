#!/bin/bash
# Deployment script for Telegram Summary Bot
# This script builds and deploys the bot to AWS using SAM
#
# Usage:
#   ./scripts/deploy.sh                    # Deploy with default settings
#   ./scripts/deploy.sh --guided           # First-time guided deployment
#   ./scripts/deploy.sh --env dev          # Deploy to dev environment
#   ./scripts/deploy.sh --env prod         # Deploy to prod environment
#
# Environment variables (optional):
#   TELEGRAM_BOT_TOKEN - Telegram Bot API token
#   OPENAI_API_KEY     - OpenAI API key

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
GUIDED=false
ENV="default"
SKIP_BUILD=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --guided)
            GUIDED=true
            shift
            ;;
        --env)
            ENV="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --guided      Run guided deployment (first-time setup)"
            echo "  --env ENV     Deploy to specific environment (default, dev, prod)"
            echo "  --skip-build  Skip TypeScript build step"
            echo "  -h, --help    Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Telegram Summary Bot Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Change to project root
cd "$PROJECT_ROOT"

# Step 1: Validate prerequisites
echo -e "${YELLOW}[1/5] Checking prerequisites...${NC}"

if ! command -v sam &> /dev/null; then
    echo -e "${RED}Error: AWS SAM CLI is not installed${NC}"
    echo "Install it from: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS credentials not configured${NC}"
    echo "Run 'aws configure' to set up your credentials"
    exit 1
fi

echo -e "${GREEN}✓ All prerequisites met${NC}"

# Step 2: Install dependencies
echo ""
echo -e "${YELLOW}[2/5] Installing dependencies...${NC}"

if [ ! -d "node_modules" ]; then
    npm install
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi

# Step 3: Build TypeScript
if [ "$SKIP_BUILD" = false ]; then
    echo ""
    echo -e "${YELLOW}[3/5] Building TypeScript...${NC}"
    
    npm run bundle:prod
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ TypeScript build successful${NC}"
    else
        echo -e "${RED}Error: TypeScript build failed${NC}"
        exit 1
    fi
else
    echo ""
    echo -e "${YELLOW}[3/5] Skipping TypeScript build (--skip-build)${NC}"
fi

# Step 4: SAM Build
echo ""
echo -e "${YELLOW}[4/5] Running SAM build...${NC}"

sam build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ SAM build successful${NC}"
else
    echo -e "${RED}Error: SAM build failed${NC}"
    exit 1
fi

# Step 5: SAM Deploy
echo ""
echo -e "${YELLOW}[5/5] Deploying to AWS...${NC}"

# Build parameter overrides from environment variables
PARAM_OVERRIDES=""

if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    PARAM_OVERRIDES="TelegramBotToken=$TELEGRAM_BOT_TOKEN"
fi

if [ -n "$OPENAI_API_KEY" ]; then
    if [ -n "$PARAM_OVERRIDES" ]; then
        PARAM_OVERRIDES="$PARAM_OVERRIDES OpenAIApiKey=$OPENAI_API_KEY"
    else
        PARAM_OVERRIDES="OpenAIApiKey=$OPENAI_API_KEY"
    fi
fi

# Construct deploy command
DEPLOY_CMD="sam deploy"

if [ "$GUIDED" = true ]; then
    DEPLOY_CMD="$DEPLOY_CMD --guided"
elif [ "$ENV" != "default" ]; then
    DEPLOY_CMD="$DEPLOY_CMD --config-env $ENV"
fi

if [ -n "$PARAM_OVERRIDES" ]; then
    DEPLOY_CMD="$DEPLOY_CMD --parameter-overrides $PARAM_OVERRIDES"
fi

echo "Running: $DEPLOY_CMD"
eval $DEPLOY_CMD

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Deployment Successful!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "1. Get the webhook URL from the stack outputs above"
    echo "2. Run: ./scripts/register-webhook.sh"
    echo ""
else
    echo -e "${RED}Error: Deployment failed${NC}"
    exit 1
fi
