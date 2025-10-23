# Video Elicitation Annotation Tool

## Overview

A localhost web application for annotating expert craftsmen videos with synchronized audio elicitations and automatic transcription. Built for the European "ReSource" project to capture traditional crafts expertise for AI-assisted learning.

## Features

- 🎥 **Video Annotation**: Seamless recording while video plays
- 🎤 **Real-time Audio Capture**: Record explanations synchronized with video
- 📝 **Automatic Transcription**: OpenAI Whisper integration for speech-to-text
- 📊 **Visual Timeline**: Color-coded annotation segments on video timeline
- 📦 **Batch Processing**: Load and annotate multiple videos in sequence
- 💾 **Data Export**: JSON/CSV export for RAG system integration
- 🔄 **Real-time Updates**: WebSocket support for transcription progress

## System Requirements

- Windows 11 (primary target)
- Python 3.9 or higher
- Modern web browser (Chrome/Edge recommended)
- Microphone for audio recording
- 4GB RAM minimum (8GB recommended)
- Internet connection (for Fireworks.ai API calls)

## Quick Start

### 1. Installation

```powershell
# Clone or navigate to the project directory
cd video-elicitation

# Install Python dependencies
pip install -r requirements.txt
```

### 2. Configure Fireworks.ai API

This application uses Fireworks.ai for fast, cloud-based Whisper transcription.

1. Get your API key from [Fireworks.ai](https://fireworks.ai/)
2. Copy `.env.example` to `.env`:
   ```powershell
   copy .env.example .env
   ```
3. Edit `.env` and add your API key:
   ```
   FIREWORKS_API_KEY=your_actual_api_key_here
   ```

### 3. Launch Application

```powershell
# Option 1: Use the startup script
.\start.bat

# Option 2: Manual start
python backend/main.py
```

The application will automatically open in your default browser at `http://localhost:8000`

### 3. Basic Workflow

1. **Load Videos**: Click "Add Videos" to select video files for annotation
2. **Play Video**: Use standard video controls to navigate
3. **Record Annotation**: 
   - Click the red "Record" button when you want to start annotating
   - Speak your elicitation while the video continues playing
   - Click "Stop Recording" when done
4. **Automatic Transcription**: The system will process your audio and display the transcript
5. **Review Annotations**: View all segments in the sidebar with timestamps and transcriptions
6. **Export Data**: Click "Export Annotations" to download JSON file for your RAG pipeline

## Project Structure

```
video-elicitation/
├── backend/
│   ├── main.py              # FastAPI server and endpoints
│   ├── database.py          # SQLite database operations
│   ├── models.py            # Data models and schemas
│   ├── transcription.py     # Whisper integration
│   └── config.py            # Configuration settings
├── frontend/
│   ├── index.html           # Main application interface
│   ├── js/
│   │   └── app.js           # Frontend logic and API integration
│   └── css/
│       └── styles.css       # UI styling
├── data/
│   ├── videos/              # Uploaded video files
│   ├── audio/               # Recorded audio segments
│   ├── exports/             # Exported annotation files
│   └── annotations.db       # SQLite database
├── requirements.txt         # Python dependencies
├── start.bat               # Windows startup script
└── README.md               # This file
```

## API Documentation

Once the server is running, visit `http://localhost:8000/docs` for interactive API documentation (Swagger UI).

### Main Endpoints

- `POST /api/upload-video` - Upload video file
- `POST /api/start-recording` - Begin audio recording for a video segment
- `POST /api/stop-recording` - Stop recording and trigger transcription
- `GET /api/annotations/{video_id}` - Get all annotations for a video
- `DELETE /api/annotations/{annotation_id}` - Delete an annotation
- `GET /api/export/{video_id}` - Export annotations as JSON
- `WebSocket /ws` - Real-time transcription status updates

## Configuration

### Environment Variables (.env)

- **FIREWORKS_API_KEY**: Your Fireworks.ai API key (required for transcription)

### Backend Configuration (config.py)

Edit `backend/config.py` to customize:

- **Fireworks.ai Settings**: 
  - Model: whisper-v3-turbo (fast and accurate)
  - Temperature: 0 (deterministic output)
  - VAD Model: silero (voice activity detection)
- **Audio Settings**: Sample rate, channels, format
- **File Paths**: Video storage, audio storage, exports
- **Server Settings**: Host, port, CORS origins

## Usage Guide for Researchers

### Best Practices

1. **Preparation**: Have your videos ready in a dedicated folder
2. **Environment**: Ensure quiet recording space for clear audio
3. **Microphone**: Test audio input before starting annotation session
4. **Workflow**: Complete all annotations for one video before moving to next
5. **Export**: Regularly export your work to avoid data loss

### Tips for Quality Annotations

- Speak clearly and at a moderate pace for accurate transcription
- Keep annotations focused (30 seconds to 2 minutes ideal)
- Review transcriptions and edit if needed before exporting
- Use descriptive language that explains the "why" not just the "what"

### Keyboard Shortcuts

- `Space` - Play/Pause video
- `R` - Start/Stop recording
- `F` - Toggle fullscreen
- `←/→` - Skip backward/forward 5 seconds

## Troubleshooting

### Microphone Not Working
- Check browser permissions (click lock icon in address bar)
- Ensure microphone is set as default recording device in Windows
- Restart the browser after granting permissions

### Transcription Not Working
- Ensure FIREWORKS_API_KEY is set in `.env` file
- Check your Fireworks.ai account has sufficient credits
- Verify your API key is valid and not expired
- Check server logs for specific error messages

### Video Won't Play
- Supported formats: MP4, WebM, OGG
- Convert videos if needed using VLC or HandBrake
- Check video codec compatibility with browser

### Database Errors
- Delete `data/annotations.db` to reset (backup first!)
- Check file permissions in data directory

## Data Export Format

The exported JSON follows this structure for RAG system integration:

```json
{
  "video_file": "glassblowing_session_01.mp4",
  "video_duration": 1847.5,
  "annotation_count": 15,
  "export_timestamp": "2025-10-13T14:30:00",
  "annotations": [
    {
      "id": 1,
      "start_time": 154.3,
      "end_time": 176.8,
      "duration": 22.5,
      "transcription": "here I'm turning thrice clockwise then again thrice counter clockwise to get a fair amount of glass from the furnace",
      "audio_file": "annotation_001.wav",
      "created_at": "2025-10-13T14:15:30"
    }
  ]
}
```

## Technical Details

### Backend Stack
- **FastAPI**: Modern async web framework
- **Fireworks.ai**: Cloud-based Whisper v3 Turbo transcription API
- **SQLite**: Lightweight, file-based database
- **python-multipart**: File upload handling
- **websockets**: Real-time communication
- **aiohttp**: Async HTTP client for API calls

### Frontend Stack
- **Vanilla JavaScript**: No framework dependencies for simplicity
- **Web Audio API**: Browser-based audio recording
- **HTML5 Video**: Native video player
- **CSS Grid/Flexbox**: Modern responsive layouts

## Development

### Running in Development Mode

```powershell
# Backend with auto-reload
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# View logs
# Logs are output to console
```

### Adding Features

The codebase is structured for easy enhancement:
- Add new API endpoints in `backend/main.py`
- Extend database schema in `backend/models.py`
- Add UI components in `frontend/index.html`
- Implement new features in `frontend/js/app.js`

## Future Enhancements

Potential features for future development:
- Multi-user support with authentication
- Real-time collaboration features
- Advanced timeline editing (split, merge segments)
- Integration with Moodle plugin API
- Multi-language transcription support
- Video preprocessing (frame extraction for RAG)
- Annotation tags and categories
- Search functionality across transcriptions

## Support & Contact

For issues related to the ReSource project, contact your project coordinator.

For technical issues:
1. Check the troubleshooting section above
2. Review logs in the console
3. Check GitHub issues (if applicable)

## License

MIT License

Copyright (c) 2025 Théo Akbas

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Acknowledgments

Developed for the European "ReSource" project aimed at preserving traditional crafts expertise through AI technologies.

---

**Version**: 1.0.0  
**Last Updated**: October 2025  
**Status**: Production-ready for research use
