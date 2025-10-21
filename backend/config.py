"""
Configuration settings for Video Elicitation Annotation Tool
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
CHROMA_DIR = Path("C:/Users/Theo Akbas/Documents/aiassistant_backend/chroma_langchain_db")
ELICITATION_DIR = CHROMA_DIR / "elicitations_db"
DATA_DIR = BASE_DIR / "data"
VIDEOS_DIR = DATA_DIR / "videos"
AUDIO_DIR = DATA_DIR / "audio"
EXPORTS_DIR = DATA_DIR / "exports"
FRONTEND_DIR = BASE_DIR  # Static files (css/, js/, index.html) are at project root

# Ensure directories exist
for directory in [DATA_DIR, VIDEOS_DIR, AUDIO_DIR, EXPORTS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# Database
DATABASE_URL = f"sqlite+aiosqlite:///{ELICITATION_DIR / 'annotations.db'}"

# Server settings
HOST = "0.0.0.0"
PORT = 8005
DEBUG = True

# CORS settings - adjust for production
CORS_ORIGINS = [
    "http://localhost:8005",
    "http://127.0.0.1:8005",
]

# Fireworks.ai API settings
FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY", "")  # Set this in environment variable or replace with your key
FIREWORKS_API_URL = "https://audio-turbo.us-virginia-1.direct.fireworks.ai/v1/audio/transcriptions"
FIREWORKS_MODEL = "whisper-v3-turbo"
FIREWORKS_TEMPERATURE = "0"
FIREWORKS_VAD_MODEL = "silero"
FIREWORKS_LANGUAGE = "fr"

# Fireworks.ai LLM settings for extended transcripts
FIREWORKS_LLM_API_URL = "https://api.fireworks.ai/inference/v1/completions"
FIREWORKS_LLM_MODEL = "accounts/fireworks/models/llama-v3p3-70b-instruct"
FIREWORKS_LLM_MAX_TOKENS = 360
FIREWORKS_LLM_TEMPERATURE = 0.9

# Google Drive API settings
GOOGLE_DRIVE_API_KEY = os.getenv("GOOGLE_DRIVE_API_KEY", "")  # Optional: for accessing public folders
GOOGLE_DRIVE_DEFAULT_FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "")  # Optional: default folder ID

# Audio recording settings
AUDIO_SAMPLE_RATE = 16000  # Whisper works best with 16kHz
AUDIO_CHANNELS = 1  # Mono
AUDIO_FORMAT = "wav"

# Video settings
SUPPORTED_VIDEO_FORMATS = [".mp4", ".webm", ".ogg", ".avi", ".mov"]
MAX_VIDEO_SIZE_MB = 5000  # 5GB max video size

# File upload settings
MAX_UPLOAD_SIZE = MAX_VIDEO_SIZE_MB * 1024 * 1024  # Convert to bytes

# Export settings
EXPORT_FORMAT = "json"  # json or csv
INCLUDE_AUDIO_IN_EXPORT = True

# Logging
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

# Frontend static files
STATIC_DIR = FRONTEND_DIR
