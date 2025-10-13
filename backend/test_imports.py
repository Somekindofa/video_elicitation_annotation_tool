"""
Quick test script to verify all imports work correctly
Run this from the backend directory to check for import errors
"""
import sys
import os

print("Testing imports...")
print(f"Python path: {sys.path}")
print(f"Current directory: {os.getcwd()}")
print()

try:
    print("✓ Importing config...")
    import config
    print(f"  - HOST: {config.HOST}")
    print(f"  - PORT: {config.PORT}")
    
    print("✓ Importing models...")
    import models
    
    print("✓ Importing database...")
    import database
    
    print("✓ Importing transcription...")
    import transcription
    
    print("✓ Importing main...")
    import main
    
    print()
    print("=" * 50)
    print("✅ All imports successful!")
    print("=" * 50)
    print()
    print("You can now run: python main.py")
    
except Exception as e:
    print()
    print("=" * 50)
    print(f"❌ Import Error: {e}")
    print("=" * 50)
    print()
    print("Troubleshooting:")
    print("1. Make sure you're in the 'backend' directory")
    print("2. Run: pip install -r ../requirements.txt")
    print("3. Check that all .py files exist in backend/")
    sys.exit(1)
