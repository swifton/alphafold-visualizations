#!/bin/bash

# MSA Visualization Server Launcher
# This script activates the virtual environment, starts the server,
# and automatically restarts it if it crashes.

set -e  # Exit on error during setup

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}MSA Visualization Server${NC}"
echo "========================================"

# Check if virtual environment exists
VENV_PATH="$PROJECT_ROOT/.venv"
if [ ! -d "$VENV_PATH" ]; then
    echo -e "${RED}Error: Virtual environment not found at $VENV_PATH${NC}"
    echo "Please create it first with: python3 -m venv $VENV_PATH"
    exit 1
fi

# Activate virtual environment
echo -e "${GREEN}Activating virtual environment...${NC}"
source "$VENV_PATH/bin/activate"

# Check if numpy is installed (basic dependency check)
if ! python -c "import numpy" 2>/dev/null; then
    echo -e "${YELLOW}Warning: numpy not found in virtual environment${NC}"
    echo "You may need to install dependencies first"
fi

# Change to the msa directory
cd "$SCRIPT_DIR"

# Server configuration
PORT=8000
MAX_CRASHES=5
CRASH_COUNT=0
RESTART_DELAY=2

echo -e "${GREEN}Starting server on port $PORT...${NC}"
echo "Press Ctrl+C to stop the server"
echo "========================================"
echo ""

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down server...${NC}"
    exit 0
}

# Trap Ctrl+C and call cleanup
trap cleanup SIGINT SIGTERM

# Main server loop with auto-restart
while true; do
    # Start the server
    python3 server.py

    # If we get here, the server exited
    EXIT_CODE=$?
    CRASH_COUNT=$((CRASH_COUNT + 1))

    echo -e "\n${RED}Server exited with code $EXIT_CODE${NC}"

    # Check if we've crashed too many times
    if [ $CRASH_COUNT -ge $MAX_CRASHES ]; then
        echo -e "${RED}Server has crashed $CRASH_COUNT times. Giving up.${NC}"
        exit 1
    fi

    # Wait before restarting
    echo -e "${YELLOW}Restarting in $RESTART_DELAY seconds... (crash $CRASH_COUNT/$MAX_CRASHES)${NC}"
    sleep $RESTART_DELAY

done
