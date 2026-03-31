#!/bin/bash

# Setup script for unused code scanning tools
# This script installs all required tools as dev dependencies

set -e

echo "🔧 Setting up unused code scanning tools..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm is not installed. Please install Node.js first.${NC}"
    exit 1
fi

echo -e "${BLUE}Installing tools...${NC}"
echo ""

# Install PurgeCSS
echo -e "${YELLOW}→ Installing PurgeCSS...${NC}"
npm install --save-dev purgecss @fullhuman/postcss-purgecss || {
    echo -e "${RED}✗ Failed to install PurgeCSS${NC}"
    exit 1
}
echo -e "${GREEN}✓ PurgeCSS installed${NC}"

# Install unimported
echo -e "${YELLOW}→ Installing unimported...${NC}"
npm install --save-dev unimported || {
    echo -e "${RED}✗ Failed to install unimported${NC}"
    exit 1
}
echo -e "${GREEN}✓ unimported installed${NC}"

# Install depcheck
echo -e "${YELLOW}→ Installing depcheck...${NC}"
npm install --save-dev depcheck || {
    echo -e "${RED}✗ Failed to install depcheck${NC}"
    exit 1
}
echo -e "${GREEN}✓ depcheck installed${NC}"

echo ""
echo -e "${GREEN}✨ All tools installed successfully!${NC}"
echo ""
echo "Next steps:"
echo "  1. Run: npm run scan:unused"
echo "  2. Review the output and remove unused code"
echo "  3. Run: npm run scan:unused -- --fix (to auto-fix ESLint issues)"
echo ""

