#!/bin/bash

# Health Bot AI Backend Setup Script
# This script helps set up the backend for first-time use

set -e

echo "🚀 Health Bot AI Backend Setup"
echo "============================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Node.js
echo "Checking Node.js version..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 20+${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${YELLOW}⚠️  Node.js version is ${NODE_VERSION}. Recommended: 20+${NC}"
else
    echo -e "${GREEN}✅ Node.js $(node -v)${NC}"
fi

# Check MongoDB
echo ""
echo "Checking MongoDB..."
if mongosh --eval "db.version()" --quiet &> /dev/null; then
    echo -e "${GREEN}✅ MongoDB is running${NC}"
else
    echo -e "${YELLOW}⚠️  MongoDB is not running or not accessible${NC}"
    echo "   Start with: brew services start mongodb-community"
fi

# Check Redis
echo ""
echo "Checking Redis (Docker)..."
if docker ps | grep -q diet-coach-redis; then
    echo -e "${GREEN}✅ Redis container is running${NC}"
else
    echo -e "${YELLOW}⚠️  Redis container is not running${NC}"
    echo "   Start with: cd docker/redis && docker-compose up -d"
fi

# Check LM Studio
echo ""
echo "Checking LM Studio..."
if curl -s http://localhost:1234/v1/models > /dev/null 2>&1; then
    echo -e "${GREEN}✅ LM Studio server is running${NC}"
else
    echo -e "${YELLOW}⚠️  LM Studio server is not accessible at http://localhost:1234${NC}"
    echo "   Please start LM Studio and enable the server"
fi

# Setup backend
echo ""
echo "Setting up backend..."
cd backend

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp ../backend.env.example .env
    echo -e "${GREEN}✅ Created .env file${NC}"
else
    echo -e "${GREEN}✅ .env file already exists${NC}"
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
if npm install; then
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

echo ""
echo "============================"
echo -e "${GREEN}✅ Backend setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Start the backend: cd backend && npm run dev"
echo "  2. Ingest seed documents: curl -X POST http://localhost:3001/rag/ingest"
echo "  3. Test the API: curl -X POST http://localhost:3001/chat/message -H 'Content-Type: application/json' -d '{\"userId\":\"test\",\"text\":\"What causes bloating?\"}'"
echo ""

