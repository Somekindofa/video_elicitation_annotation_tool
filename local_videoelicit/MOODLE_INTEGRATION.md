# Moodle Integration Guide

## Overview

This document explains how the Video Elicitation Tool integrates with Moodle as a local plugin. The integration preserves all functionality while adding Moodle authentication, permissions, and file storage.

## Architecture

### Components

1. **Moodle Plugin** (`local_videoelicit`)
   - Native Moodle plugin in `/var/www/html/local/videoelicit/`
   - Handles authentication, permissions, and UI
   - Stores metadata in Moodle database
   - Manages files through Moodle file API

2. **FastAPI Backend** (Python)
   - Runs as a separate service on localhost:8005
   - Handles video processing, transcription, LLM operations
   - Validates JWT tokens from Moodle
   - Stores processing data in SQLite

3. **PHP Streaming Proxy**
   - Serves video files with HTTP Range request support
   - Essential for video seeking in HTML5 player
   - Enforces Moodle permissions

4. **PHP API Proxy**
   - Routes API calls from frontend to FastAPI backend
   - Injects Moodle user context
   - Manages authentication tokens

### Data Flow

```
User Browser
    ↓
Moodle PHP (Auth & Permissions)
    ↓ (generates JWT)
Frontend JavaScript
    ↓ (API calls with JWT)
PHP API Proxy
    ↓ (validates & forwards)
FastAPI Backend
    ↓ (processes & responds)
PHP API Proxy
    ↓
Frontend JavaScript
```

### Video Streaming Flow (Critical for Range Requests)

```
HTML5 Video Player
    ↓ (GET with Range: bytes=X-Y header)
stream.php (PHP)
    ↓ (validates permissions)
Moodle File API
    ↓ (reads file chunk)
stream.php
    ↓ (206 Partial Content response)
Video Player (continues playback)
```

## Installation

### 1. Install Moodle Plugin

```bash
# Copy plugin to Moodle
cp -r /path/to/local/videoelicit /var/www/html/local/

# Set permissions
chown -R www-data:www-data /var/www/html/local/videoelicit

# Visit Moodle admin to trigger installation
# Navigate to: Site administration > Notifications
```

### 2. Configure FastAPI Backend

```bash
cd /home/video_elicitation_annotation_tool

# Create .env from example
cp .env.example .env

# Edit .env and set:
nano .env
```

Required settings in `.env`:
```
MOODLE_INTEGRATION=true
MOODLE_JWT_SECRET=your-secure-secret-key-here
MOODLE_PROXY_MODE=true
MOODLE_ORIGIN=http://your-moodle-server.com
FIREWORKS_API_KEY=your_fireworks_api_key
```

### 3. Install Python Dependencies

```bash
cd /home/video_elicitation_annotation_tool
pip install -r requirements.txt
```

### 4. Run Database Migration

```bash
cd /home/video_elicitation_annotation_tool/backend
python migrate_moodle_fields.py
```

### 5. Start FastAPI Backend as a Service

Create systemd service file `/etc/systemd/system/videoelicit-backend.service`:

```ini
[Unit]
Description=Video Elicitation FastAPI Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/home/video_elicitation_annotation_tool/backend
Environment="PATH=/usr/bin:/usr/local/bin"
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 127.0.0.1 --port 8005
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
systemctl daemon-reload
systemctl enable videoelicit-backend
systemctl start videoelicit-backend
systemctl status videoelicit-backend
```

### 6. Configure Moodle Plugin Settings

1. Log in to Moodle as admin
2. Navigate to: **Site administration > Plugins > Local plugins > Video Elicitation Tool**
3. Set the following:
   - **JWT Secret Key**: Same value as `MOODLE_JWT_SECRET` in backend `.env`
   - **FastAPI Backend URL**: `http://localhost:8005`
   - **Token Quota**: `0` (unlimited) or set a limit per user
4. Click **Save changes**

### 7. Assign Capabilities

Navigate to **Site administration > Users > Permissions > Define roles**

For **Student** role:
- ✓ local/videoelicit:view
- ✓ local/videoelicit:annotate

For **Teacher** role:
- ✓ local/videoelicit:view
- ✓ local/videoelicit:annotate
- ✓ local/videoelicit:viewall

For **Editing Teacher** role:
- ✓ local/videoelicit:view
- ✓ local/videoelicit:annotate
- ✓ local/videoelicit:manage
- ✓ local/videoelicit:viewall

## Usage

### Accessing the Tool

1. Navigate to: `http://your-moodle-site/local/videoelicit/index.php`
2. Or add a link in navigation (see below)

### Adding to Navigation

Edit your theme's navbar template (e.g., `/var/www/html/public/theme/boost/templates/navbar.mustache`):

```html
<a class="nav-link" href="{{config.wwwroot}}/local/videoelicit/index.php">
    <i class="fa fa-video"></i> CraftPilot
</a>
```

### Uploading Videos

1. Click **Upload Video** button
2. Select video file (MP4, WebM, OGG, AVI, MOV)
3. Video is stored in Moodle file system
4. Metadata synced with FastAPI backend

### Creating Annotations

1. Select a video
2. Play video to desired position
3. Click **Record** button
4. Speak your elicitation while video plays
5. Click **Stop** when done
6. Audio is captured, stored in Moodle files
7. FastAPI backend transcribes with Whisper
8. LLM processes for tags and review

### Viewing Annotations

- All users can see their own annotations
- Teachers/Managers with `viewall` capability see all annotations in their context

## Technical Details

### HTTP Range Request Support

The critical feature for video streaming is HTTP Range request support, which allows:
- Seeking to any position in the video
- Resume playback after pause
- Efficient bandwidth usage (only loads needed chunks)

Implementation in `stream.php`:
```php
// Parse Range header
$range = $_SERVER['HTTP_RANGE']; // e.g., "bytes=1024-2047"

// Return 206 Partial Content with:
header('HTTP/1.1 206 Partial Content');
header("Content-Range: bytes $start-$end/$filesize");
header('Accept-Ranges: bytes');

// Stream only requested chunk
fseek($handle, $start);
fread($handle, $length);
```

### Authentication Flow

1. User logs into Moodle (standard Moodle session)
2. PHP generates JWT token containing:
   - `userid`: Moodle user ID
   - `username`: Moodle username
   - `contextid`: Moodle context ID
   - `roles`: Array of role shortnames
   - `exp`: Expiration timestamp (60 minutes)
3. Frontend receives token via JavaScript initialization
4. All API calls include `Authorization: Bearer <token>` header
5. FastAPI validates JWT signature and checks expiration
6. FastAPI extracts user context and enforces permissions

### Database Schema

#### Moodle Tables

**`local_videoelicit_videos`**
- Maps Moodle files to FastAPI video records
- Stores `contextid` for permission filtering
- Tracks `fastapi_video_id` for synchronization

**`local_videoelicit_annotations`**
- Stores annotation metadata
- Links to Moodle files for audio
- References `fastapi_annotation_id`

**`local_videoelicit_usage`**
- Tracks LLM token usage per user
- Enforces quotas if configured

#### FastAPI/SQLite Tables

**`videos`**
- Original schema plus Moodle fields:
  - `moodle_userid`
  - `moodle_contextid`
  - `moodle_file_id`
  - `moodle_username`

**`annotations`**
- Original schema plus Moodle fields:
  - `moodle_userid`
  - `moodle_contextid`
  - `moodle_username`
  - `moodle_audio_file_id`

### File Storage

- **Videos**: Stored in Moodle file API (context-based)
- **Audio**: Stored in Moodle file API (annotation-specific)
- **Exports**: Generated by FastAPI, can be stored in either system

File areas in Moodle:
- `local_videoelicit/videos` - uploaded videos
- `local_videoelicit/audio` - annotation audio files

## Troubleshooting

### Backend Not Responding

```bash
# Check if service is running
systemctl status videoelicit-backend

# View logs
journalctl -u videoelicit-backend -f

# Restart service
systemctl restart videoelicit-backend
```

### JWT Token Errors

- Ensure `MOODLE_JWT_SECRET` matches in both backend `.env` and Moodle plugin settings
- Check token expiration (default 60 minutes)
- Verify FastAPI backend is receiving Authorization header

### Video Streaming Issues

- Verify `stream.php` is accessible and not blocked by permissions
- Check file exists in Moodle file API: `SELECT * FROM mdl_files WHERE component='local_videoelicit'`
- Test Range request manually with curl:
  ```bash
  curl -H "Range: bytes=0-1023" http://localhost/local/videoelicit/stream.php?videoid=1
  ```
- Should return `206 Partial Content` with `Content-Range` header

### Permission Errors

```bash
# Check user capabilities in context
SELECT cap.capability, perm.permission 
FROM mdl_role_capabilities cap
JOIN mdl_role_assignments assign ON assign.roleid = cap.roleid
JOIN mdl_role_context_permissions perm ON perm.capability = cap.capability
WHERE assign.userid = <userid> AND assign.contextid = <contextid>
  AND cap.capability LIKE 'local/videoelicit:%'
```

## Development

### Testing Changes

1. **Backend changes**: Restart FastAPI service
   ```bash
   systemctl restart videoelicit-backend
   ```

2. **Frontend JavaScript**: Clear AMD cache
   ```bash
   php admin/cli/purge_caches.php
   ```

3. **Templates**: Purge theme cache
   - Navigate to: Site administration > Development > Purge all caches

### Debugging

Enable debugging in Moodle:
- Site administration > Development > Debugging
- Set to **DEVELOPER: extra Moodle debug messages**

FastAPI debug logs:
```bash
journalctl -u videoelicit-backend -f
```

## Security Considerations

1. **JWT Secret**: Use a strong, random secret key (min. 32 characters)
2. **Backend Access**: FastAPI should only listen on localhost (127.0.0.1)
3. **File Permissions**: Moodle enforces context-based access via `stream.php`
4. **HTTPS**: Use HTTPS in production for Moodle server
5. **Token Expiration**: Tokens expire after 60 minutes, requiring re-authentication

## Migration from Standalone Version

To migrate from standalone tool to Moodle plugin:

1. Export all annotations using standalone tool's export feature
2. Install Moodle plugin
3. Copy SQLite database to new location (optional)
4. Re-upload videos through Moodle interface
5. Import annotations if needed (custom migration script required)

## Support

For issues specific to:
- **Moodle integration**: Check Moodle logs and capabilities
- **Video processing**: Check FastAPI backend logs
- **Transcription**: Verify Fireworks.ai API key and credits

## Changelog

### v1.0.0-alpha (2026-02-11)
- Initial Moodle integration
- HTTP Range request support for video streaming
- JWT authentication
- Native Moodle UI with Mustache templates
- AMD JavaScript module
- Capabilities and permissions system
