"""
Google Drive API Service for accessing public folder videos
Supports both public folders (no auth) and API key authentication
"""
import logging
import requests
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# Google Drive API endpoints
GDRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
GDRIVE_FILES_ENDPOINT = f"{GDRIVE_API_BASE}/files"


def list_videos_from_folder(folder_id: str, api_key: Optional[str] = None) -> List[Dict]:
    """
    List all video files from a public Google Drive folder
    
    Args:
        folder_id: Google Drive folder ID
        api_key: Optional Google Drive API key for authentication
        
    Returns:
        List of video file metadata (id, name, size, mimeType)
        
    Raises:
        Exception: If API request fails
    """
    try:
        # Query parameters
        params = {
            'q': f"'{folder_id}' in parents and (mimeType contains 'video/' or mimeType='application/octet-stream')",
            'fields': 'files(id, name, size, mimeType, videoMediaMetadata)',
            'orderBy': 'name',
            'pageSize': 100  # Max files to return
        }
        
        # Add API key if provided
        if api_key:
            params['key'] = api_key
        
        # Make request to Google Drive API
        response = requests.get(GDRIVE_FILES_ENDPOINT, params=params)
        
        if response.status_code == 403:
            raise Exception("Access denied. Folder may be private or API key is invalid.")
        
        if response.status_code == 404:
            raise Exception("Folder not found. Check the folder ID.")
        
        response.raise_for_status()
        
        data = response.json()
        files = data.get('files', [])
        
        # Filter and format video files
        video_files = []
        for file in files:
            mime_type = file.get('mimeType', '')
            # Accept video/* mimetypes or common video extensions
            if mime_type.startswith('video/') or file['name'].lower().endswith(('.mp4', '.mov', '.avi', '.mkv', '.webm')):
                video_metadata = file.get('videoMediaMetadata', {})
                video_files.append({
                    'id': file['id'],
                    'name': file['name'],
                    'size': int(file.get('size', 0)),
                    'mimeType': mime_type,
                    'duration': format_duration(video_metadata.get('durationMillis')) if video_metadata.get('durationMillis') else None
                })
        
        logger.info(f"Found {len(video_files)} video files in folder {folder_id}")
        return video_files
        
    except requests.RequestException as e:
        logger.error(f"Error accessing Google Drive API: {e}")
        raise Exception(f"Failed to access Google Drive: {str(e)}")


def get_video_stream_url(file_id: str, api_key: Optional[str] = None) -> str:
    """
    Get direct download/stream URL for a Google Drive video file
    
    Args:
        file_id: Google Drive file ID
        api_key: Optional API key
        
    Returns:
        Direct download URL
    """
    url = f"{GDRIVE_FILES_ENDPOINT}/{file_id}?alt=media"
    if api_key:
        url += f"&key={api_key}"
    return url


def format_duration(duration_millis: str) -> str:
    """
    Format video duration from milliseconds to readable format
    
    Args:
        duration_millis: Duration in milliseconds as string
        
    Returns:
        Formatted duration string (e.g., "1:23" or "1:02:34")
    """
    try:
        total_seconds = int(duration_millis) // 1000
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        
        if hours > 0:
            return f"{hours}:{minutes:02d}:{seconds:02d}"
        else:
            return f"{minutes}:{seconds:02d}"
    except (ValueError, TypeError):
        return None


async def stream_video_from_gdrive(file_id: str, api_key: Optional[str] = None):
    """
    Stream video file from Google Drive (for proxying through backend)
    
    Args:
        file_id: Google Drive file ID
        api_key: Optional API key
        
    Yields:
        Video data chunks
    """
    import aiohttp
    
    url = get_video_stream_url(file_id, api_key)
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            if response.status != 200:
                raise Exception(f"Failed to stream video from Google Drive: {response.status}")
            
            # Stream in chunks
            async for chunk in response.content.iter_chunked(8192):
                yield chunk
