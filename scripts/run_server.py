#!/usr/bin/env python3
"""
Server startup script with enhanced error handling and configuration
"""

import sys
import subprocess
import os
from pathlib import Path

def check_python_version():
    """Check if Python version is compatible"""
    if sys.version_info < (3, 7):
        print("❌ Python 3.7 or higher is required")
        print(f"Current version: {sys.version}")
        return False
    print(f"✅ Python version: {sys.version.split()[0]}")
    return True

def install_requirements():
    """Install required packages"""
    print("📦 Installing required packages...")
    req_path = os.path.join(os.path.dirname(__file__), 'requirements.txt')
    try:
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "-r", req_path
        ])
        print("✅ Packages installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install packages: {e}")
        return False

def check_port_availability():
    """Check if port 8080 is available"""
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('localhost', 8080))
        print("✅ Port 8080 is available")
        return True
    except OSError:
        print("⚠️  Port 8080 is already in use")
        print("Please stop any other services using port 8080 or modify the port in app.py")
        return False

def main():
    """Main startup function"""
    print("🚀 Starting Chat Server Setup...")
    print("=" * 50)
    
    # Check Python version
    if not check_python_version():
        return 1
    
    # Check port availability
    if not check_port_availability():
        return 1
    
    # Install requirements
    if not install_requirements():
        return 1
    
    print("\n" + "=" * 50)
    print("🎉 Setup complete! Starting server...")
    print("📡 Server will be available at: http://localhost:8080")
    print("🔌 WebSocket endpoint: ws://localhost:8080")
    print("⏹️  Press Ctrl+C to stop the server")
    print("=" * 50)
    
    # Start the server
    try:
        from app import socketio, app
        socketio.run(
            app,
            host='0.0.0.0',
            port=8080,
            debug=False,
            allow_unsafe_werkzeug=True
        )
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("Make sure all dependencies are installed correctly")
        return 1
    except KeyboardInterrupt:
        print("\n👋 Server stopped by user")
        return 0
    except Exception as e:
        print(f"❌ Server error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
