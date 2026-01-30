#!/bin/bash
# Local testing script for Telegram Summary Bot
# Uses Docker for DynamoDB Local and SAM CLI for Lambda invocation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DYNAMODB_PORT=8001
DOCKER_NETWORK="telegram-bot-network"

echo -e "${GREEN}=== Telegram Summary Bot Local Testing ===${NC}"

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed${NC}"
        exit 1
    fi
    
    if ! command -v sam &> /dev/null; then
        echo -e "${RED}Error: SAM CLI is not installed${NC}"
        echo "Install with: brew install aws-sam-cli"
        exit 1
    fi
    
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}Error: AWS CLI is not installed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}All prerequisites met!${NC}"
}

# Start DynamoDB Local
start_dynamodb() {
    echo -e "${YELLOW}Starting DynamoDB Local...${NC}"
    docker compose up -d dynamodb-local
    
    # Wait for DynamoDB to be ready
    echo "Waiting for DynamoDB Local to be ready..."
    sleep 3
    
    # Check if DynamoDB is responding
    if curl -s http://localhost:${DYNAMODB_PORT} > /dev/null 2>&1; then
        echo -e "${GREEN}DynamoDB Local is running on port ${DYNAMODB_PORT}${NC}"
    else
        echo -e "${RED}Failed to start DynamoDB Local${NC}"
        exit 1
    fi
}

# Create DynamoDB table
create_table() {
    echo -e "${YELLOW}Creating DynamoDB table...${NC}"
    
    # Check if table exists
    TABLE_EXISTS=$(aws dynamodb list-tables \
        --endpoint-url http://localhost:${DYNAMODB_PORT} \
        --region us-east-1 \
        --output text 2>/dev/null | grep -c "telegram-summary-bot-messages" || true)
    
    if [ "$TABLE_EXISTS" -gt 0 ]; then
        echo "Table already exists, skipping creation"
        return
    fi
    
    aws dynamodb create-table \
        --table-name telegram-summary-bot-messages \
        --attribute-definitions \
            AttributeName=chatId,AttributeType=N \
            AttributeName=timestamp,AttributeType=N \
        --key-schema \
            AttributeName=chatId,KeyType=HASH \
            AttributeName=timestamp,KeyType=RANGE \
        --billing-mode PAY_PER_REQUEST \
        --endpoint-url http://localhost:${DYNAMODB_PORT} \
        --region us-east-1 \
        > /dev/null
    
    echo -e "${GREEN}Table created successfully${NC}"
}

# Build the application
build_app() {
    echo -e "${YELLOW}Building application...${NC}"
    npm run bundle:prod
    sam build
    echo -e "${GREEN}Build complete${NC}"
}

# Run local invoke
invoke_local() {
    local event_file="${1:-events/test-message.json}"
    
    echo -e "${YELLOW}Invoking Lambda locally with event: ${event_file}${NC}"
    
    sam local invoke TelegramBotFunction \
        --event "$event_file" \
        --env-vars env.local.json \
        --docker-network ${DOCKER_NETWORK}
}

# Start local API
start_api() {
    echo -e "${YELLOW}Starting local API Gateway...${NC}"
    echo -e "${GREEN}API will be available at http://localhost:3000/webhook${NC}"
    echo "Press Ctrl+C to stop"
    
    sam local start-api \
        --env-vars env.local.json \
        --docker-network ${DOCKER_NETWORK} \
        --port 3000
}

# Stop services
stop_services() {
    echo -e "${YELLOW}Stopping services...${NC}"
    docker compose down
    echo -e "${GREEN}Services stopped${NC}"
}

# Scan DynamoDB table
scan_table() {
    echo -e "${YELLOW}Scanning DynamoDB table...${NC}"
    aws dynamodb scan \
        --table-name telegram-summary-bot-messages \
        --endpoint-url http://localhost:${DYNAMODB_PORT} \
        --region us-east-1
}

# Show usage
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  setup     - Start DynamoDB Local and create table"
    echo "  build     - Build the application"
    echo "  invoke    - Invoke Lambda with test event"
    echo "  api       - Start local API Gateway"
    echo "  scan      - Scan DynamoDB table contents"
    echo "  stop      - Stop all services"
    echo "  all       - Setup, build, and invoke"
    echo ""
    echo "Examples:"
    echo "  $0 setup                              # Start DynamoDB and create table"
    echo "  $0 invoke                             # Invoke with default test event"
    echo "  $0 invoke events/test-help-command.json  # Invoke with specific event"
    echo "  $0 api                                # Start local API for webhook testing"
    echo "  $0 scan                               # View stored messages"
}

# Main
case "${1:-all}" in
    setup)
        check_prerequisites
        start_dynamodb
        create_table
        ;;
    build)
        build_app
        ;;
    invoke)
        invoke_local "${2:-events/test-message.json}"
        ;;
    api)
        start_api
        ;;
    scan)
        scan_table
        ;;
    stop)
        stop_services
        ;;
    all)
        check_prerequisites
        start_dynamodb
        create_table
        build_app
        invoke_local
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        usage
        exit 1
        ;;
esac
