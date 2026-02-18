# OwnCloud Video Integration Guide

## For the External Frontend (`/videoelicit-ui/`)

This guide explains how to add OwnCloud video browsing to the iframed frontend.

## Available Query Parameters

When the frontend is loaded in the iframe, the following parameters are passed:

```
?token=<JWT_TOKEN>&owncloud_base_url=https://cloud.minesparis.psl.eu&owncloud_user_id=aadda5c2-2019-103f-8e2d-bb8e1f6141ce&webdav_api_url=http://moodle.local/local/videoelicit/webdav_api.php
```

| Parameter | Example | Usage |
|-----------|---------|-------|
| `token` | JWT token | Use for authentication with api_proxy.php |
| `owncloud_base_url` | `https://cloud.minesparis.psl.eu` | OwnCloud server URL |
| `owncloud_user_id` | `aadda5c2-2019-103f-8e2d-bb8e1f6141ce` | User/folder UUID |
| `webdav_api_url` | `http://moodle.local/local/videoelicit/webdav_api.php` | Moodle API endpoint |

## API Endpoints

### Check WebDAV Configuration
```
GET /local/videoelicit/webdav_api.php?action=checkconfig
```

Response:
```json
{
    "configured": true,
    "base_url": "https://cloud.minesparis.psl.eu"
}
```

### Browse OwnCloud Directory
```
GET /local/videoelicit/webdav_api.php?action=browse&path=/folder%20name
```

Response:
```json
{
    "items": [
        {
            "name": "subfolder",
            "path": "https://cloud.minesparis.psl.eu/remote.php/dav/files/uuid/subfolder",
            "url": "https://cloud.minesparis.psl.eu/remote.php/dav/files/uuid/subfolder",
            "type": "dir",
            "size": 0,
            "mimetype": "inode/directory"
        },
        {
            "name": "video.mp4",
            "path": "https://cloud.minesparis.psl.eu/remote.php/dav/files/uuid/video.mp4",
            "url": "https://cloud.minesparis.psl.eu/remote.php/dav/files/uuid/video.mp4",
            "type": "file",
            "size": 123456789,
            "mimetype": "video/mp4"
        }
    ]
}
```

### Link OwnCloud Video to Plugin
```
POST /local/videoelicit/webdav_api.php?action=link

Body:
{
    "url": "https://cloud.minesparis.psl.eu/remote.php/dav/files/uuid/video.mp4",
    "filename": "video.mp4",
    "filesize": 123456789
}
```

Response:
```json
{
    "success": true,
    "video": {
        "id": 42,
        "filename": "video.mp4",
        "duration": 600.25,
        "source_type": "webdav"
    }
}
```

## JavaScript Integration Example

```javascript
// Get query parameters
const params = new URLSearchParams(window.location.search);
const webdavApiUrl = params.get('webdav_api_url');

// Check if OwnCloud is configured
async function checkOwnCloudConfig() {
    const response = await fetch(`${webdavApiUrl}?action=checkconfig`);
    const data = await response.json();
    return data.configured;
}

// Browse a directory
async function browseOwnCloud(path = '/') {
    const response = await fetch(
        `${webdavApiUrl}?action=browse&path=${encodeURIComponent(path)}`
    );
    const data = await response.json();
    return data.items;
}

// Link a video
async function linkOwnCloudVideo(url, filename, filesize) {
    const response = await fetch(`${webdavApiUrl}?action=link`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            url: url,
            filename: filename,
            filesize: filesize
        })
    });
    const data = await response.json();
    return data;
}

// Usage
if (await checkOwnCloudConfig()) {
    // Add button to UI
    const items = await browseOwnCloud('/');
    // Display items...
    
    // On selection
    await linkOwnCloudVideo(
        'https://cloud.../video.mp4',
        'video.mp4',
        123456789
    );
}
```

## CORS Notes

- The webdav_api.php endpoint has CORS headers enabled
- Requests can be made from any origin (the iframe)
- Session/authentication is cookie-based (Moodle session)

## Moodle-Side Handling

Once a video is linked via the API:
1. Video record stored in `mdl_local_videoelicit_videos` with:
   - `source_type = 'webdav'`
   - `external_url = <full WebDAV URL>`
2. When playing, `stream.php` detects source_type and proxies from OwnCloud
3. HTTP Range requests preserved for seeking support

---

**No further Moodle plugin changes needed.** Just integrate the above in your external frontend!
