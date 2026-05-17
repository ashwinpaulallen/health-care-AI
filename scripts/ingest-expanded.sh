#!/bin/bash

# Script to ingest expanded knowledge base documents
# Run this after starting the backend server

API_URL="http://localhost:3001/admin/knowledge"

echo "================================================"
echo "Ingesting Expanded Knowledge Base"
echo "================================================"
echo ""

# Function to ingest a document
ingest_document() {
    local domain=$1
    local title=$2
    local file=$3
    
    echo "📄 Ingesting: $title ($domain)"
    
    # Read file content and escape for JSON
    content=$(cat "$file" | jq -Rs .)
    
    # Create JSON payload
    json_payload=$(cat <<EOF
{
  "domain": "$domain",
  "title": "$title",
  "content": $content,
  "tags": []
}
EOF
)
    
    # Send POST request
    response=$(curl -s -X POST "$API_URL/$domain" \
        -H "Content-Type: application/json" \
        -d "$json_payload")
    
    # Check if successful
    if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
        chunks=$(echo "$response" | jq -r '.chunksCreated')
        echo "   ✅ Success! Created $chunks chunks"
    else
        error=$(echo "$response" | jq -r '.message // "Unknown error"')
        echo "   ❌ Failed: $error"
    fi
    echo ""
}

# Check if backend is running
echo "Checking if backend is running..."
if ! curl -s "$API_URL/symptom" > /dev/null 2>&1; then
    echo "❌ Error: Backend is not running or not accessible at $API_URL"
    echo "Please start the backend server first:"
    echo "  cd backend && pnpm dev"
    exit 1
fi
echo "✅ Backend is running"
echo ""

# Get the seeds directory path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEEDS_DIR="$(dirname "$SCRIPT_DIR")/seeds"

echo "Seeds directory: $SEEDS_DIR"
echo ""

# Ingest symptom documents
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SYMPTOM DOCUMENTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -f "$SEEDS_DIR/constipation.md" ]; then
    ingest_document "symptom" "Constipation: Causes, Management, and Prevention" "$SEEDS_DIR/constipation.md"
else
    echo "⚠️  constipation.md not found"
fi

if [ -f "$SEEDS_DIR/fatigue.md" ]; then
    ingest_document "symptom" "Fatigue and Low Energy: Understanding and Management" "$SEEDS_DIR/fatigue.md"
else
    echo "⚠️  fatigue.md not found"
fi

# Ingest food documents
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "FOOD & NUTRITION DOCUMENTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -f "$SEEDS_DIR/indian-vegetables.md" ]; then
    ingest_document "food" "Indian Vegetables: Nutritional Guide and Health Benefits" "$SEEDS_DIR/indian-vegetables.md"
else
    echo "⚠️  indian-vegetables.md not found"
fi

if [ -f "$SEEDS_DIR/healthy-snacks.md" ]; then
    ingest_document "food" "Healthy Indian Snacks: Nutritious Options" "$SEEDS_DIR/healthy-snacks.md"
else
    echo "⚠️  healthy-snacks.md not found"
fi

echo "================================================"
echo "Ingestion Complete!"
echo "================================================"
echo ""
echo "Summary:"
echo "  - Check above for any errors"
echo "  - Visit http://localhost:3000/admin to view documents"
echo "  - Test queries in the chat interface"
echo ""

