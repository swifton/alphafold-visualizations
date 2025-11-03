#!/bin/bash

# MSA Visualization Server Launcher
# This script activates the virtual environment, starts the server,
# and automatically restarts it if it crashes.
#
# To stop the server, create a file named 'stop-server' in this directory
# or press Ctrl+C

set -e  # Exit on error during setup

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Configuration
LOG_FILE="$SCRIPT_DIR/server.log"
STOP_FILE="$SCRIPT_DIR/stop-server"
VENV_PATH="$PROJECT_ROOT/.venv"
PORT=8000
MAX_CRASHES=5
CRASH_COUNT=0
RESTART_DELAY=2

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}MSA Visualization Server${NC}"
echo "========================================"

# Check if virtual environment exists
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

# Remove any existing stop file
rm -f "$STOP_FILE"

echo -e "${GREEN}Starting server on port $PORT...${NC}"
echo "Logging to: $LOG_FILE"
echo ""
echo "To stop the server:"
echo "  1. Press Ctrl+C, or"
echo "  2. Run: touch $SCRIPT_DIR/stop-server"
echo "========================================"
echo ""

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down server...${NC}"
    rm -f "$STOP_FILE"
    exit 0
}

# Trap Ctrl+C and call cleanup
trap cleanup SIGINT SIGTERM

# Main server loop with auto-restart
while true; do
    # Check for stop file before starting/restarting
    if [ -f "$STOP_FILE" ]; then
        echo -e "${YELLOW}Stop file detected. Shutting down...${NC}"
        rm -f "$STOP_FILE"
        exit 0
    fi

    # Log timestamp
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting server..." | tee -a "$LOG_FILE"

    # Start the server and log output
    python3 server.py 2>&1 | tee -a "$LOG_FILE"

    # If we get here, the server exited
    EXIT_CODE=$?
    CRASH_COUNT=$((CRASH_COUNT + 1))

    echo -e "\n${RED}[$(date '+%Y-%m-%d %H:%M:%S')] Server exited with code $EXIT_CODE${NC}" | tee -a "$LOG_FILE"

    # Check for stop file after crash
    if [ -f "$STOP_FILE" ]; then
        echo -e "${YELLOW}Stop file detected. Shutting down...${NC}"
        rm -f "$STOP_FILE"
        exit 0
    fi

    # Check if we've crashed too many times
    if [ $CRASH_COUNT -ge $MAX_CRASHES ]; then
        echo -e "${RED}Server has crashed $CRASH_COUNT times. Giving up.${NC}" | tee -a "$LOG_FILE"
        exit 1
    fi

    # Wait before restarting
    echo -e "${YELLOW}Restarting in $RESTART_DELAY seconds... (crash $CRASH_COUNT/$MAX_CRASHES)${NC}" | tee -a "$LOG_FILE"
    sleep $RESTART_DELAY

done
