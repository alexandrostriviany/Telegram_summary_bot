#!/bin/bash
# Script to check for photo messages in DynamoDB

# Get the table name from environment or use default
TABLE_NAME=${DYNAMODB_TABLE:-"telegram-summary-messages"}

echo "Checking for photo messages in table: $TABLE_NAME"
echo "================================================"
echo ""

# Scan for messages containing the photo indicator
aws dynamodb scan \
  --table-name "$TABLE_NAME" \
  --filter-expression "contains(#txt, :photo)" \
  --expression-attribute-names '{"#txt":"text"}' \
  --expression-attribute-values '{":photo":{"S":"[📷 Photo]"}}' \
  --projection-expression "chatId,#txt,username,messageId" \
  --output table

echo ""
echo "Total photo messages found:"
aws dynamodb scan \
  --table-name "$TABLE_NAME" \
  --filter-expression "contains(#txt, :photo)" \
  --expression-attribute-names '{"#txt":"text"}' \
  --expression-attribute-values '{":photo":{"S":"[📷 Photo]"}}' \
  --select COUNT \
  --output json | jq '.Count'
