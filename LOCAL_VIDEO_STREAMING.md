# Local Video Streaming Feature

## Overview
Stream large local video files (e.g., 11GB) without uploading them. Videos are served with HTTP Range Request support, enabling proper streaming just like YouTube or Netflix.

## How It Works

### Architecture
1. **No File Copying**: Video paths are stored in database, files stay on your disk
2. **HTTP Range Requests**: Browser requests video chunks as needed (partial content)
3. **Efficient Streaming**: Only loads what's needed for playback
4. **Database Tracking**: Videos marked with `is_local=1` and `source_type="local"`

### Backend Changes
- **New Fields**: `Video.is_local` (boolean) and `Video.source_type` (string)
- **Browse Endpoint**: `GET /api/videos/local/browse?directory=<path>` - Lists video files in folder
- **Register Endpoint**: `POST /api/videos/local/register` - Adds video to database without copying
- **Streaming Endpoint**: `GET /api/videos/{video_id}/file` - Now supports Range headers (206 Partial Content)

### Frontend Changes
- **"Browse Local Folder" Button**: Opens modal to browse local directories
- **Local Video Modal**: Enter folder path, browse videos, add them with one click
- **Same Player**: Uses existing video player (no changes needed for playback)

## Usage Instructions

### Step 1: Start the Application
```bash
start.bat
```
Or manually:
```bash
cd backend
python main.py
```

### Step 2: Browse Local Folder
1. Click **"Browse Local Folder"** button in header
2. Enter the **absolute path** to your video folder:
   - **Windows**: `C:\Users\YourName\Videos\MyProject`
   - **Linux/Mac**: `/home/username/Videos/MyProject`
3. Click **"Browse Folder"**

### Step 3: Add Videos
- Found videos appear with filename, size, and path
- Click **"Add"** button next to any video
- Video is registered instantly (no upload!)

### Step 4: Annotate as Normal
- Select the video from "Select Video" dropdown
- Video streams from your local disk
- Recording, transcription, and extended transcripts work normally

## Technical Details

### HTTP Range Request Support
The video endpoint now handles partial content requests:

```python
# Browser requests: Range: bytes=0-1023
# Server responds: 206 Partial Content
# Content-Range: bytes 0-1023/11000000000
```

This enables:
- ✅ Seek anywhere in video instantly
- ✅ No need to load entire file
- ✅ Works with 11GB+ files
- ✅ Standard HTML5 video player support

### Security Considerations
- ⚠️ Server can access any path you provide
- ⚠️ Only use on trusted local machine or secured network
- ⚠️ Do NOT expose to internet without authentication

### File Deletion Behavior
When deleting a video:
- **Uploaded videos**: File deleted from `data/videos/`
- **Local videos**: File NOT deleted (stays in original location)
- **Annotations**: Audio files always deleted from `data/audio/`

## Database Schema Changes

### Video Table
```sql
-- New columns (auto-migrates on startup)
is_local INTEGER DEFAULT 0           -- 0=uploaded, 1=local
source_type VARCHAR DEFAULT "uploaded"  -- "uploaded", "local", "gdrive"
```

### Migration
- Database auto-migrates on first run
- Existing videos default to `is_local=0` and `source_type="uploaded"`
- No manual migration needed

## Troubleshooting

### "Directory not found" Error
- Ensure path is absolute (not relative)
- Check path exists and is accessible
- Windows: Use backslashes `C:\path\to\folder` or forward slashes `C:/path/to/folder`

### "No video files found"
- Check folder contains `.mp4`, `.webm`, `.mov`, or `.avi` files
- Verify file extensions are lowercase or uppercase

### Video won't play
1. Check browser console for errors
2. Verify file exists at registered path
3. Try restarting the server
4. Check file is a valid video format

### Streaming is slow
- Local disk speed matters (SSD vs HDD)
- Check other processes aren't using heavy disk I/O
- Network streaming not recommended (use for local files only)

## Comparison with Other Methods

| Method | Upload Time | Disk Usage | Large File Support | Setup |
|--------|-------------|------------|-------------------|-------|
| **Upload** | Minutes-Hours | 2x (original + copy) | ❌ Limited by RAM | Easy |
| **Google Drive** | Pre-uploaded | 1x (cloud) | ✅ Yes | Requires API key |
| **Local Streaming** | **Instant** | **1x (original)** | **✅ Yes** | **Easiest** |

## Example: 11GB Video

**Before (Upload Method)**:
- Upload time: ~30 minutes (on decent internet)
- Disk space: 11GB original + 11GB copy = 22GB
- Memory: Must load chunks in RAM

**After (Local Streaming)**:
- "Upload" time: **<1 second** (just registers path)
- Disk space: 11GB (no copy made)
- Memory: Only loads requested chunks (efficient)

## API Examples

### Browse Local Folder
```bash
curl "http://localhost:8005/api/videos/local/browse?directory=C:/Videos/Project"
```

Response:
```json
{
  "directory": "C:\\Videos\\Project",
  "video_count": 2,
  "videos": [
    {
      "filename": "expert_demo.mp4",
      "filepath": "C:\\Videos\\Project\\expert_demo.mp4",
      "file_size": 11811160064,
      "file_size_mb": 11264.5
    }
  ]
}
```

### Register Local Video
```bash
curl -X POST http://localhost:8005/api/videos/local/register \
  -H "Content-Type: application/json" \
  -d '{"filepath": "C:/Videos/Project/expert_demo.mp4"}'
```

Response:
```json
{
  "id": 42,
  "filename": "expert_demo.mp4",
  "filepath": "C:\\Videos\\Project\\expert_demo.mp4",
  "is_local": 1,
  "source_type": "local",
  "file_size": 11811160064,
  ...
}
```

### Stream Video (Browser automatically handles Range requests)
```
GET /api/videos/42/file
Range: bytes=0-1048575

HTTP/1.1 206 Partial Content
Content-Range: bytes 0-1048575/11811160064
Content-Length: 1048576
Accept-Ranges: bytes
```

## Future Enhancements (Not Implemented)
- [ ] Network path support (SMB/NFS shares)
- [ ] Recursive folder scanning
- [ ] Video thumbnail generation
- [ ] Automatic folder watching
- [ ] Multi-folder library management

## Presentation Tips for Tomorrow

**Problem Statement**:
> "I have an 11GB video and no Google Drive space. I need to annotate it TODAY."

**Solution** (Show this):
1. Click "Browse Local Folder" → Enter path → Videos appear instantly
2. Click "Add" → Video registered in <1 second
3. Start annotating → Streams perfectly, no lag

**Key Selling Points**:
- ✅ **Zero upload time** (perfect for deadline pressure)
- ✅ **No external dependencies** (no cloud needed)
- ✅ **Production-ready** (uses standard HTTP streaming)
- ✅ **Backward compatible** (uploaded videos still work)

Good luck with your presentation! 🎉
