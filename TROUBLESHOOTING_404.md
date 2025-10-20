# Troubleshooting: 404 Video File Not Found

## Problem
When trying to register a local video, you get:
```
Error registering local video: Error: Video file not found
```

## Root Cause & Solution

The issue was that HTML entity encoding was being applied to the filepath before sending it to the server. For example:
- Real path: `C:\Users\Videos\test.mp4`
- What was being sent: `C:\Users\Videos\test.mp4` (with HTML entities)

### Fix Applied

Changed from inline `onclick` with escaped strings to proper event listeners with raw data:

**Before:**
```javascript
onclick="registerLocalVideo('${escapeHtml(video.filepath)}', ...)"
// This HTML-encodes the path!
```

**After:**
```javascript
// Store raw data in window.localVideosData
// Use data-attributes and event listeners
// Pass raw filepath without encoding
```

## How to Test

### 1. Restart Server (Important!)
```bash
# Stop server (Ctrl+C)
start.bat
```

### 2. Open Browser Console
- Press F12
- Go to Console tab
- You should now see detailed logs:
  ```
  Registering local video: { filepath: "C:\...", filename: "..." }
  ```

### 3. Test Registration
- Click "Browse Local Folder"
- Enter a folder path (e.g., `C:\Users\YourName\Videos`)
- Click "Browse Folder"
- You should see videos listed
- Click "Add" on a video
- Check Console for logs

### 4. Check Backend Logs
Look at the terminal where the server is running. You should see:
```
INFO: Attempting to register local video: C:\...
INFO: Local video registered: filename.mp4 (ID=X, X.XGB)
```

If you see an error, it will show:
```
ERROR: File not found: C:\... (resolved to: ...)
```

## Common Issues & Solutions

### Issue 1: Path with Backslashes Not Working

**Symptoms:**
```
ERROR: File not found: C:\Users\Videos\test.mp4
```

**Solution:**
Windows paths work fine, but make sure you're typing them correctly. Try:
- `C:\Users\YourName\Videos` (Windows style)
- `C:/Users/YourName/Videos` (Forward slashes also work)

### Issue 2: Network Drive / Mapped Drive

**Symptoms:**
```
ERROR: File not found: Z:\Videos\test.mp4
```

**Solution:**
Mapped drives should work, but the server needs access. Make sure:
- The drive is mounted when server starts
- The server process has permissions to access it

### Issue 3: Path with Spaces

**Symptoms:**
```
ERROR: File not found: C:\My Videos\test.mp4
```

**Solution:**
Paths with spaces work fine now! No quotes needed in the input field.

### Issue 4: File Extension Not Supported

**Symptoms:**
```
Error: Unsupported video format
```

**Solution:**
Check `backend/config.py` for `SUPPORTED_VIDEO_FORMATS`. Should include:
- `.mp4`, `.webm`, `.mov`, `.avi`, `.mkv`, `.flv`, `.wmv`

Add more formats if needed in config.py.

## Debug Checklist

- [ ] Server restarted after code changes
- [ ] Browser console open (F12 → Console)
- [ ] Backend logs visible in terminal
- [ ] File path copied directly from File Explorer
- [ ] File exists at that exact path
- [ ] File extension is supported

## Manual Path Verification

In Windows File Explorer:
1. Navigate to your video file
2. Click on the address bar (shows full path)
3. Copy the path: `C:\Users\YourName\Videos`
4. Paste directly into "Folder Path" field
5. Click "Browse Folder"

## Testing with Python

You can verify paths work from Python:

```python
from pathlib import Path

# Test the path
test_path = r"C:\Users\YourName\Videos\test.mp4"
p = Path(test_path)

print(f"Exists: {p.exists()}")
print(f"Is file: {p.is_file()}")
print(f"Absolute: {p.absolute()}")
print(f"Extension: {p.suffix}")
```

## What the Logs Should Show

### Successful Registration

**Browser Console:**
```
Registering local video: { 
  filepath: "C:\\Users\\...\\video.mp4", 
  filename: "video.mp4" 
}
```

**Backend Terminal:**
```
INFO: Attempting to register local video: C:\Users\...\video.mp4
INFO: Local video registered: video.mp4 (ID=1, 0.5GB)
```

### Failed Registration

**Browser Console:**
```
Registering local video: { filepath: "...", filename: "..." }
Registration failed: { detail: "Video file not found at path: ..." }
Error registering local video: Error: Video file not found at path: ...
```

**Backend Terminal:**
```
INFO: Attempting to register local video: C:\...
ERROR: File not found: C:\... (resolved to: C:\...)
```

## Still Having Issues?

1. **Check the exact path in the error message** - Does it match your file?
2. **Try a simple path first** - Test with `C:\test.mp4` in root (if accessible)
3. **Check file permissions** - Can you open the file in media player?
4. **Try forward slashes** - `C:/Users/Videos/test.mp4`
5. **Check server logs** - The resolved path might give a clue

## Quick Test Script

Create `test_path.py`:
```python
from pathlib import Path
import sys

if len(sys.argv) < 2:
    print("Usage: python test_path.py 'C:\\path\\to\\video.mp4'")
    sys.exit(1)

test_path = sys.argv[1]
p = Path(test_path)

print(f"Testing path: {test_path}")
print(f"Absolute path: {p.absolute()}")
print(f"Exists: {p.exists()}")
print(f"Is file: {p.is_file()}")
print(f"Extension: {p.suffix}")

if p.exists() and p.is_file():
    size_mb = p.stat().st_size / (1024 * 1024)
    print(f"Size: {size_mb:.2f} MB")
    print("✅ Path is valid!")
else:
    print("❌ Path is invalid!")
```

Run it:
```bash
python test_path.py "C:\Users\YourName\Videos\test.mp4"
```

## Summary of Changes

✅ Fixed HTML entity encoding issue  
✅ Added detailed console logging  
✅ Added backend path resolution logging  
✅ Changed to event listener approach (no inline onclick)  
✅ Store raw data in `window.localVideosData`  

**Result:** Filepaths are now sent to the server exactly as they appear on disk, without any encoding that could break the path.
