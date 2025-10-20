"""
Quick test script for local video streaming feature
Run this after starting the server to verify endpoints work
"""

import requests
import json

API_BASE = "http://localhost:8005"

def test_browse_folder():
    """Test browsing a local folder"""
    print("\n=== Testing Local Folder Browse ===")
    
    # Change this to a real path on your system with videos
    test_path = input("Enter a folder path with videos (or press Enter to skip): ").strip()
    
    if not test_path:
        print("Skipped folder browse test")
        return None
    
    try:
        response = requests.get(
            f"{API_BASE}/api/videos/local/browse",
            params={"directory": test_path}
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Found {data['video_count']} videos in {data['directory']}")
            
            for video in data['videos'][:3]:  # Show first 3
                print(f"  - {video['filename']} ({video['file_size_mb']} MB)")
            
            return data['videos'][0] if data['videos'] else None
        else:
            print(f"✗ Error: {response.json()}")
            return None
            
    except Exception as e:
        print(f"✗ Error: {e}")
        return None


def test_register_video(filepath):
    """Test registering a local video"""
    print("\n=== Testing Video Registration ===")
    
    if not filepath:
        print("Skipped registration test (no video to register)")
        return None
    
    try:
        response = requests.post(
            f"{API_BASE}/api/videos/local/register",
            json={"filepath": filepath}
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Registered: {data['filename']} (ID: {data['id']})")
            print(f"  is_local: {data['is_local']}")
            print(f"  source_type: {data['source_type']}")
            return data['id']
        else:
            print(f"✗ Error: {response.json()}")
            return None
            
    except Exception as e:
        print(f"✗ Error: {e}")
        return None


def test_stream_video(video_id):
    """Test streaming a video with Range requests"""
    print("\n=== Testing Video Streaming ===")
    
    if not video_id:
        print("Skipped streaming test (no video ID)")
        return
    
    try:
        # Test full request
        response = requests.get(f"{API_BASE}/api/videos/{video_id}/file")
        print(f"Full request status: {response.status_code}")
        
        if response.status_code == 200:
            print(f"✓ Full video accessible ({len(response.content)} bytes)")
            print(f"  Accept-Ranges: {response.headers.get('Accept-Ranges')}")
        
        # Test range request
        headers = {"Range": "bytes=0-1023"}
        response = requests.get(
            f"{API_BASE}/api/videos/{video_id}/file",
            headers=headers
        )
        
        print(f"\nRange request status: {response.status_code}")
        
        if response.status_code == 206:
            print(f"✓ Range request works!")
            print(f"  Content-Range: {response.headers.get('Content-Range')}")
            print(f"  Content-Length: {response.headers.get('Content-Length')}")
            print(f"✓ HTTP Streaming is WORKING! 🎉")
        else:
            print(f"✗ Expected 206, got {response.status_code}")
            
    except Exception as e:
        print(f"✗ Error: {e}")


def test_health():
    """Test server health"""
    print("\n=== Testing Server Health ===")
    
    try:
        response = requests.get(f"{API_BASE}/api/health")
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Server is healthy")
            print(f"  Status: {data['status']}")
            return True
        else:
            print(f"✗ Server returned {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Server not reachable: {e}")
        print("  Make sure you've started the server with: start.bat or python backend/main.py")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("LOCAL VIDEO STREAMING TEST")
    print("=" * 60)
    
    # Check server is running
    if not test_health():
        print("\n❌ Tests aborted - server not running")
        exit(1)
    
    # Test folder browsing
    first_video = test_browse_folder()
    
    if first_video:
        # Test video registration
        video_id = test_register_video(first_video['filepath'])
        
        # Test streaming
        if video_id:
            test_stream_video(video_id)
    
    print("\n" + "=" * 60)
    print("TESTS COMPLETE")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Open http://localhost:8005 in your browser")
    print("2. Click 'Browse Local Folder'")
    print("3. Enter the folder path you just tested")
    print("4. Add a video and start annotating!")
    print("\nFor your 11GB video, it should register instantly!")
