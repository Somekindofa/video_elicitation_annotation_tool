# Google Drive Video Integration

This feature allows you to load and annotate videos directly from public Google Drive folders without downloading them locally.

## Features

- 📁 Load videos from any public Google Drive folder
- 🎥 Stream videos directly for annotation
- 📋 Browse and select videos from a sidebar list
- 🚀 No local storage needed - videos stream on demand

## Setup

### Option 1: Public Folders (No API Key Required)

If your Google Drive folder is publicly accessible ("Anyone with the link can view"), you can use it directly:

1. Make sure your Google Drive folder is set to "Public" or "Anyone with the link"
2. Get the folder ID from the URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
3. Click "Load Google Drive Videos" button in the app
4. Paste the folder ID and click "Load"

### Option 2: With API Key (Recommended for Better Rate Limits)

For better reliability and higher rate limits:

1. **Create Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one

2. **Enable Google Drive API**:
   - Navigate to "APIs & Services" → "Library"
   - Search for "Google Drive API"
   - Click "Enable"

3. **Create API Key**:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy the generated API key

4. **Add to .env file**:
   ```bash
   GOOGLE_DRIVE_API_KEY=your_api_key_here
   ```

5. **Optional - Set Default Folder**:
   ```bash
   GOOGLE_DRIVE_FOLDER_ID=your_default_folder_id
   ```

## Usage

### Loading Videos from Google Drive

1. **Click "Load Google Drive Videos"** button in the header
2. **Enter Folder ID** in the dropdown input
3. **Click "Load"** or press Enter
4. **Videos appear** in the left sidebar
5. **Click any video** to load it in the player

### Getting Folder ID

From any Google Drive folder URL:
```
https://drive.google.com/drive/folders/1AbC2DeF3GhI4JkL5MnO6PqR7StU8VwX9
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                        This is your folder ID
```

### Supported Video Formats

- MP4 (.mp4)
- MOV (.mov)
- AVI (.avi)
- MKV (.mkv)
- WebM (.webm)

## How It Works

1. **Backend fetches** video list from Google Drive API
2. **Videos stream** directly from Google Drive (proxied through backend)
3. **No local storage** - videos aren't downloaded
4. **Annotations can still be saved** locally to your database

## Troubleshooting

### "Access denied" Error
- Make sure the folder is public ("Anyone with the link can view")
- Or add a valid `GOOGLE_DRIVE_API_KEY` to your .env file

### "Folder not found" Error
- Double-check the folder ID
- Ensure the folder exists and hasn't been deleted

### Videos Not Loading
- Check that files are actually video format (not docs/images)
- Ensure videos aren't DRM-protected or restricted

### Rate Limiting
- Without API key: Limited to ~100 requests per 100 seconds
- With API key: Much higher limits (10,000+ requests per day)

## API Endpoints

### List Videos from Folder
```
GET /api/gdrive/videos?folder_id={folder_id}

Response:
[
  {
    "id": "video_file_id",
    "name": "video_name.mp4",
    "size": 12345678,
    "mimeType": "video/mp4",
    "duration": "1:23"
  }
]
```

### Stream Video
```
GET /api/gdrive/video/{file_id}/stream

Response: Video stream (video/mp4)
```

## Limitations

- Annotations for Google Drive videos are **not automatically saved** to the Google Drive folder
- Videos must be in a **public or shared folder**
- Very large videos (>2GB) may take time to buffer
- Requires internet connection while annotating

## Future Enhancements

Potential improvements for future versions:

- [ ] OAuth authentication for private folders
- [ ] Upload annotations back to Google Drive
- [ ] Folder browsing (subfolders)
- [ ] Caching for frequently accessed videos
- [ ] Batch download option
- [ ] Integration with Google Drive permissions

## Security Notes

- API keys should be kept **private** (never commit to git)
- Use public folders or proper OAuth for sensitive content
- Videos stream through your backend (not directly to browser)
- Consider rate limiting if exposing publicly
