#!/bin/bash

# Cascade Master Installer
# One-click installation script

set -e

echo "🚀 Installing Cascade Master..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required. Please install Node.js 18+ first."
    exit 1
fi

# Check for bun (preferred)
if command -v bun &> /dev/null; then
    PACKAGE_MANAGER="bun"
elif command -v npm &> /dev/null; then
    PACKAGE_MANAGER="npm"
else
    echo "❌ No package manager found. Please install bun or npm."
    exit 1
fi

echo "📦 Using $PACKAGE_MANAGER as package manager"

# Create installation directory
INSTALL_DIR="$HOME/.cascade-master"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Clone or download the project
if command -v git &> /dev/null; then
    echo "📥 Cloning Cascade Master..."
    git clone https://github.com/your-repo/cascade-master.git .
else
    echo "📥 Downloading Cascade Master..."
    # Fallback to curl/wget download
    curl -L https://github.com/your-repo/cascade-master/archive/main.tar.gz | tar -xz --strip-components=1
fi

# Install dependencies
echo "📦 Installing dependencies..."
if [ "$PACKAGE_MANAGER" = "bun" ]; then
    bun install --production
else
    npm ci --production
fi

# Create systemd service (Linux)
if command -v systemctl &> /dev/null && [ -d /etc/systemd/system ]; then
    echo "🔧 Creating systemd service..."
    cat > /tmp/cascade-master.service << EOF
[Unit]
Description=Cascade Master API Gateway
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$PACKAGE_MANAGER start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
EOF

    sudo mv /tmp/cascade-master.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable cascade-master
    echo "✅ Service installed. Start with: sudo systemctl start cascade-master"
fi

# Create launch script
cat > cascade-master << EOF
#!/bin/bash
cd "$INSTALL_DIR"
export NODE_ENV=production
export PORT=3001
exec $PACKAGE_MANAGER start
EOF
chmod +x cascade-master

# Add to PATH
SHELL_RC=""
if [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
fi

if [ -n "$SHELL_RC" ]; then
    echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$SHELL_RC"
    echo "✅ Added to PATH in $SHELL_RC"
fi

echo ""
echo "🎉 Cascade Master installed successfully!"
echo ""
echo "🚀 Quick Start:"
echo "  cd $INSTALL_DIR"
echo "  ./cascade-master"
echo ""
echo "🌐 Web Interface: http://localhost:3001"
echo "📖 API Endpoint: http://localhost:3001/api/cascade"
echo ""
echo "🔧 Management:"
if command -v systemctl &> /dev/null; then
    echo "  sudo systemctl start cascade-master    # Start service"
    echo "  sudo systemctl stop cascade-master     # Stop service"
    echo "  sudo systemctl status cascade-master   # Check status"
fi
echo ""
echo "📝 Next Steps:"
echo "  1. Configure your API providers in the web interface"
echo "  2. Set up cascade rules for intelligent routing"
echo "  3. Update your applications to use: http://localhost:3001/api/cascade"
echo ""
echo "Happy cascading! 🎯"