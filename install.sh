#!/bin/bash

# Cascade Engine Installer
# One-click installation script

set -e

echo "Installing Cascade Engine..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js is required. Please install Node.js 18+ first."
    exit 1
fi

# Check for bun (preferred)
if command -v bun &> /dev/null; then
    PACKAGE_MANAGER="bun"
elif command -v npm &> /dev/null; then
    PACKAGE_MANAGER="npm"
else
    echo "No package manager found. Please install bun or npm."
    exit 1
fi

echo "Using $PACKAGE_MANAGER as package manager"

# Create installation directory
INSTALL_DIR="$HOME/.cascade-engine"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Clone or download the project
if command -v git &> /dev/null; then
    echo "Cloning Cascade Engine..."
    git clone https://github.com/YOUR_USERNAME/cascade-engine.git .
else
    echo "Downloading Cascade Engine..."
    curl -L https://github.com/YOUR_USERNAME/cascade-engine/archive/main.tar.gz | tar -xz --strip-components=1
fi

# Install dependencies
echo "Installing dependencies..."
if [ "$PACKAGE_MANAGER" = "bun" ]; then
    bun install --production
else
    npm ci --production
fi

# Create systemd service (Linux)
if command -v systemctl &> /dev/null && [ -d /etc/systemd/system ]; then
    echo "Creating systemd service..."
    cat > /tmp/cascade-engine.service << EOF
[Unit]
Description=Cascade Engine API Gateway
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$PACKAGE_MANAGER run server
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
EOF

    sudo mv /tmp/cascade-engine.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable cascade-engine
    echo "Service installed. Start with: sudo systemctl start cascade-engine"
fi

# Create launch script
cat > cascade-engine << EOF
#!/bin/bash
cd "$INSTALL_DIR"
export NODE_ENV=production
export PORT=3001
exec $PACKAGE_MANAGER run server
EOF
chmod +x cascade-engine

# Add to PATH
SHELL_RC=""
if [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
fi

if [ -n "$SHELL_RC" ]; then
    echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$SHELL_RC"
    echo "Added to PATH in $SHELL_RC"
fi

echo ""
echo "Cascade Engine installed successfully!"
echo ""
echo "Quick Start:"
echo "  cd $INSTALL_DIR"
echo "  ./cascade-engine"
echo ""
echo "API Server: http://localhost:3001"
echo "API Docs: http://localhost:3001/api/docs"
echo ""
echo "Management:"
if command -v systemctl &> /dev/null; then
    echo "  sudo systemctl start cascade-engine    # Start service"
    echo "  sudo systemctl stop cascade-engine     # Stop service"
    echo "  sudo systemctl status cascade-engine   # Check status"
fi
echo ""
echo "Next Steps:"
echo "  1. Start the server: bun run server"
echo "  2. Open API docs: http://localhost:3001/api/docs"
echo "  3. Register a user: POST /api/users/register"
echo "  4. Configure providers, models, and cascade rules"
echo ""
echo "Happy cascading!"