"""
FastAPI main application for Video Elicitation Annotation Tool
"""
import os
import base64
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional
import uuid

from fastapi import FastAPI, File, UploadFile, Depends, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
import aiofiles
from starlette.types import Scope

# Use absolute imports to allow running main.py directly
import database as db
import models
from transcription import transcribe_audio_simple, preload_model, get_model_info
import gdrive_service
from config import (
    HOST, PORT, CORS_ORIGINS, VIDEOS_DIR, AUDIO_DIR, EXPORTS_DIR,
    STATIC_DIR, FRONTEND_DIR, SUPPORTED_VIDEO_FORMATS, MAX_UPLOAD_SIZE,
    GOOGLE_DRIVE_API_KEY, GOOGLE_DRIVE_DEFAULT_FOLDER_ID
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Video Elicitation Annotation Tool",
    description="Tool for annotating expert craftsmen videos with audio elicitations",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to websocket: {e}")

manager = ConnectionManager()


# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    """Initialize database and preload Whisper model"""
    logger.info("Starting Video Elicitation Annotation Tool...")
    
    # Ensure required directories exist
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Directories verified")
    
    await db.init_db()
    logger.info("Database initialized")
    
    # Preload Whisper model in background
    import asyncio
    asyncio.create_task(preload_model())
    logger.info("Whisper model loading in background...")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down Video Elicitation Annotation Tool...")


# WebSocket endpoint for real-time updates
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive and receive any client messages
            data = await websocket.receive_text()
            logger.debug(f"Received from client: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# API Endpoints

@app.get("/")
async def read_root():
    """Serve the main frontend application"""
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "Video Elicitation Annotation Tool API"}


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "whisper_model": get_model_info()
    }


@app.post("/api/videos/upload", response_model=models.VideoResponse)
async def upload_video(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(db.get_session)
):
    """Upload a video file"""
    try:
        # Validate file type
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in SUPPORTED_VIDEO_FORMATS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported video format. Supported: {', '.join(SUPPORTED_VIDEO_FORMATS)}"
            )
        
        # Generate unique filename
        unique_filename = f"{uuid.uuid4().hex}_{file.filename}"
        file_path = VIDEOS_DIR / unique_filename
        
        # Save file
        logger.info(f"Uploading video: {file.filename}")
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            if len(content) > MAX_UPLOAD_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"File too large. Maximum size: {MAX_UPLOAD_SIZE / (1024*1024)}MB"
                )
            await f.write(content)
        
        # Get file size
        file_size = os.path.getsize(file_path)
        
        # Create database record
        video_data = models.VideoCreate(
            filename=file.filename,
            filepath=str(file_path),
            file_size=file_size,
            mime_type=file.content_type
        )
        
        video = await db.create_video(session, video_data)
        logger.info(f"Video uploaded successfully: ID={video.id}")
        
        # Add annotation count
        response_data = models.VideoResponse.model_validate(video)
        response_data.annotation_count = 0
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading video: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/videos", response_model=List[models.VideoResponse])
async def list_videos(
    skip: int = 0,
    limit: int = 100,
    session: AsyncSession = Depends(db.get_session)
):
    """Get list of all videos"""
    try:
        videos = await db.get_all_videos(session, skip, limit)
        
        # Add annotation count to each video
        response_videos = []
        for video in videos:
            video_response = models.VideoResponse.model_validate(video)
            video_response.annotation_count = len(video.annotations)
            response_videos.append(video_response)
        
        return response_videos
        
    except Exception as e:
        logger.error(f"Error listing videos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/videos/{video_id}", response_model=models.VideoResponse)
async def get_video(
    video_id: int,
    session: AsyncSession = Depends(db.get_session)
):
    """Get video by ID"""
    try:
        video = await db.get_video(session, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        
        video_response = models.VideoResponse.model_validate(video)
        video_response.annotation_count = len(video.annotations)
        
        return video_response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting video: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/videos/{video_id}/file")
async def get_video_file(
    video_id: int,
    request: Request,
    session: AsyncSession = Depends(db.get_session)
):
    """Serve video file with HTTP Range request support for streaming"""
    try:
        video = await db.get_video(session, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        
        if not os.path.exists(video.filepath):
            raise HTTPException(status_code=404, detail="Video file not found on disk")
        
        # Get file info
        file_size = os.path.getsize(video.filepath)
        
        # Handle Range requests for streaming
        range_header = request.headers.get("range")
        
        if range_header:
            # Parse range header (e.g., "bytes=0-1023")
            range_match = range_header.replace("bytes=", "").split("-")
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if len(range_match) > 1 and range_match[1] else file_size - 1
            
            # Ensure valid range
            if start >= file_size or end >= file_size:
                raise HTTPException(status_code=416, detail="Range not satisfiable")
            
            chunk_size = end - start + 1
            
            # Stream the requested chunk
            def iter_file():
                with open(video.filepath, "rb") as f:
                    f.seek(start)
                    remaining = chunk_size
                    while remaining > 0:
                        read_size = min(8192, remaining)
                        data = f.read(read_size)
                        if not data:
                            break
                        remaining -= len(data)
                        yield data
            
            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(chunk_size),
                "Content-Type": video.mime_type or "video/mp4",
            }
            
            return StreamingResponse(
                iter_file(),
                status_code=206,  # Partial Content
                headers=headers
            )
        else:
            # No range header - serve entire file
            return FileResponse(
                video.filepath,
                media_type=video.mime_type or "video/mp4",
                headers={"Accept-Ranges": "bytes"}
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving video file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/videos/{video_id}", response_model=models.VideoResponse)
async def update_video(
    video_id: int,
    video_update: dict,
    session: AsyncSession = Depends(db.get_session)
):
    """Update video metadata (e.g., project_id, batch_position)"""
    try:
        video = await db.get_video(session, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        
        # Update allowed fields
        if 'project_id' in video_update:
            video.project_id = video_update['project_id']
        if 'batch_position' in video_update:
            video.batch_position = video_update['batch_position']
        
        await session.commit()
        await session.refresh(video)
        
        video_response = models.VideoResponse.model_validate(video)
        video_response.annotation_count = len(video.annotations)
        
        logger.info(f"Video updated: ID={video_id}")
        return video_response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating video: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/videos/{video_id}")
async def delete_video(
    video_id: int,
    session: AsyncSession = Depends(db.get_session)
):
    """Delete a video and all its annotations"""
    try:
        video = await db.get_video(session, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        
        # Only delete video file if it was uploaded (not local)
        if video.is_local == 0 and os.path.exists(video.filepath):
            os.remove(video.filepath)
        
        # Delete annotation audio files
        for annotation in video.annotations:
            if os.path.exists(annotation.audio_filepath):
                os.remove(annotation.audio_filepath)
        
        # Delete from database
        await db.delete_video(session, video_id)
        
        logger.info(f"Video deleted: ID={video_id}")
        return {"status": "success", "message": "Video deleted"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting video: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# LOCAL VIDEO ENDPOINTS
# ============================================================================

@app.get("/api/videos/local/browse")
async def browse_local_directory(directory: str):
    """
    Browse a local directory for video files
    
    Args:
        directory: Absolute path to directory to browse
        
    Returns:
        List of video files with metadata
    """
    try:
        dir_path = Path(directory)
        
        # Security check - ensure directory exists and is accessible
        if not dir_path.exists():
            raise HTTPException(status_code=404, detail="Directory not found")
        
        if not dir_path.is_dir():
            raise HTTPException(status_code=400, detail="Path is not a directory")
        
        # List all video files in directory
        video_files = []
        
        for file_path in dir_path.iterdir():
            if file_path.is_file():
                file_ext = file_path.suffix.lower()
                if file_ext in SUPPORTED_VIDEO_FORMATS:
                    try:
                        file_size = file_path.stat().st_size
                        video_files.append({
                            "filename": file_path.name,
                            "filepath": str(file_path.absolute()),
                            "file_size": file_size,
                            "file_size_mb": round(file_size / (1024 * 1024), 2)
                        })
                    except Exception as e:
                        logger.warning(f"Could not read file {file_path}: {e}")
                        continue
        
        # Sort by filename
        video_files.sort(key=lambda x: x["filename"])
        
        logger.info(f"Found {len(video_files)} video files in {directory}")
        return {
            "directory": str(dir_path.absolute()),
            "video_count": len(video_files),
            "videos": video_files
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error browsing local directory: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/videos/local/register", response_model=models.VideoResponse)
async def register_local_video(
    request: models.LocalVideoRegisterRequest,
    session: AsyncSession = Depends(db.get_session)
):
    """
    Register a local video file without copying it
    
    Args:
        request: Request body containing filepath
        
    Returns:
        Video metadata
    """
    try:
        logger.info(f"Attempting to register local video: {request.filepath}")
        file_path = Path(request.filepath)
        
        # Validate file exists
        if not file_path.exists():
            logger.error(f"File not found: {request.filepath} (resolved to: {file_path.absolute()})")
            raise HTTPException(
                status_code=404, 
                detail=f"Video file not found at path: {request.filepath}"
            )
        
        if not file_path.is_file():
            logger.error(f"Path is not a file: {request.filepath}")
            raise HTTPException(status_code=400, detail="Path is not a file")
        
        # Validate file type
        file_ext = file_path.suffix.lower()
        if file_ext not in SUPPORTED_VIDEO_FORMATS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported video format. Supported: {', '.join(SUPPORTED_VIDEO_FORMATS)}"
            )
        
        # Get file metadata
        file_size = file_path.stat().st_size
        
        # Determine MIME type
        mime_type = "video/mp4"  # Default
        if file_ext == ".webm":
            mime_type = "video/webm"
        elif file_ext == ".mov":
            mime_type = "video/quicktime"
        elif file_ext == ".avi":
            mime_type = "video/x-msvideo"
        
        # Create database record (no file copying)
        video_data = models.VideoCreate(
            filename=file_path.name,
            filepath=str(file_path.absolute()),
            file_size=file_size,
            mime_type=mime_type,
            is_local=1,
            source_type="local"
        )
        
        video = await db.create_video(session, video_data)
        logger.info(f"Local video registered: {file_path.name} (ID={video.id}, {round(file_size/(1024*1024*1024), 2)}GB)")
        
        # Add annotation count
        response_data = models.VideoResponse.model_validate(video)
        response_data.annotation_count = 0
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error registering local video: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PROJECT ENDPOINTS
# ============================================================================

@app.post("/api/projects", response_model=models.ProjectResponse)
async def create_project(
    project: models.ProjectCreate,
    session: AsyncSession = Depends(db.get_session)
):
    """Create a new project"""
    try:
        new_project = await db.create_project(session, project)
        logger.info(f"Project created: {new_project.name} (ID={new_project.id})")
        return new_project
    except Exception as e:
        logger.error(f"Error creating project: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/projects", response_model=List[models.ProjectResponse])
async def get_all_projects(
    session: AsyncSession = Depends(db.get_session)
):
    """Get all projects"""
    try:
        projects = await db.get_all_projects(session)
        return projects
    except Exception as e:
        logger.error(f"Error getting projects: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/projects/{project_id}", response_model=models.ProjectResponse)
async def get_project(
    project_id: int,
    session: AsyncSession = Depends(db.get_session)
):
    """Get a specific project by ID"""
    try:
        project = await db.get_project(session, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/projects/{project_id}/videos", response_model=List[models.VideoResponse])
async def get_project_videos(
    project_id: int,
    session: AsyncSession = Depends(db.get_session)
):
    """Get all videos in a project, ordered by batch position"""
    try:
        project = await db.get_project(session, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        videos = await db.get_videos_by_project(session, project_id)
        
        # Add annotation count to each video
        video_responses = []
        for video in videos:
            video_response = models.VideoResponse.model_validate(video)
            video_response.annotation_count = len(video.annotations)
            video_responses.append(video_response)
        
        return video_responses
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project videos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/projects/{project_id}", response_model=models.ProjectResponse)
async def update_project(
    project_id: int,
    project_update: models.ProjectUpdate,
    session: AsyncSession = Depends(db.get_session)
):
    """Update a project"""
    try:
        project = await db.get_project(session, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        updated_project = await db.update_project(session, project_id, project_update)
        logger.info(f"Project updated: ID={project_id}")
        return updated_project
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating project: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/projects/{project_id}")
async def delete_project(
    project_id: int,
    session: AsyncSession = Depends(db.get_session)
):
    """Delete a project (sets project_id to null for associated videos)"""
    try:
        project = await db.get_project(session, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        await db.delete_project(session, project_id)
        logger.info(f"Project deleted: ID={project_id}")
        return {"status": "success", "message": "Project deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting project: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/annotations", response_model=models.AnnotationResponse)
async def create_annotation(
    video_id: int,
    start_time: float,
    end_time: float,
    audio_blob: UploadFile = File(...),
    session: AsyncSession = Depends(db.get_session)
):
    """Create a new annotation with audio recording"""
    try:
        # Validate video exists
        video = await db.get_video(session, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        
        # Validate times
        if start_time >= end_time:
            raise HTTPException(status_code=400, detail="start_time must be less than end_time")
        
        # Read audio data from uploaded file
        try:
            audio_bytes = await audio_blob.read()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read audio data: {str(e)}")
        
        # Generate unique audio filename
        audio_filename = f"annotation_{uuid.uuid4().hex}.wav"
        audio_filepath = AUDIO_DIR / audio_filename
        
        # Save audio file
        async with aiofiles.open(audio_filepath, 'wb') as f:
            await f.write(audio_bytes)
        
        logger.info(f"Audio saved: {audio_filename}")
        
        # Create annotation record
        annotation_data = models.AnnotationCreate(
            video_id=video_id,
            start_time=start_time,
            end_time=end_time,
            audio_filename=audio_filename,
            audio_filepath=str(audio_filepath)
        )
        
        annotation = await db.create_annotation(session, annotation_data)
        logger.info(f"Annotation created: ID={annotation.id}")
        
        # Broadcast to WebSocket clients
        await manager.broadcast({
            "type": "annotation_created",
            "annotation_id": annotation.id,
            "video_id": video_id
        })
        
        # Start transcription in background
        import asyncio
        asyncio.create_task(process_transcription(annotation.id, str(audio_filepath)))
        
        # Prepare response
        response = models.AnnotationResponse.model_validate(annotation)
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating annotation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def process_transcription(annotation_id: int, audio_path: str):
    """Background task to process transcription"""
    try:
        # Update status to processing
        async with db.AsyncSessionLocal() as session:
            await db.update_annotation(
                session,
                annotation_id,
                models.AnnotationUpdate(transcription_status="processing")
            )
        
        # Broadcast status
        await manager.broadcast({
            "type": "transcription_status",
            "annotation_id": annotation_id,
            "status": "processing"
        })
        
        logger.info(f"Starting transcription for annotation {annotation_id}")
        
        # Perform transcription
        transcription = await transcribe_audio_simple(audio_path)
        
        # Update annotation with transcription
        async with db.AsyncSessionLocal() as session:
            await db.update_annotation(
                session,
                annotation_id,
                models.AnnotationUpdate(
                    transcription=transcription,
                    transcription_status="completed"
                )
            )
        
        logger.info(f"Transcription completed for annotation {annotation_id}")
        
        # Broadcast completion
        await manager.broadcast({
            "type": "transcription_complete",
            "annotation_id": annotation_id,
            "transcription": transcription
        })
        
        # Start extended transcript generation in background
        import asyncio
        asyncio.create_task(process_extended_transcript(annotation_id, transcription))
        
    except Exception as e:
        logger.error(f"Transcription error for annotation {annotation_id}: {e}")
        
        # Update status to failed
        try:
            async with db.AsyncSessionLocal() as session:
                await db.update_annotation(
                    session,
                    annotation_id,
                    models.AnnotationUpdate(transcription_status="failed")
                )
            
            await manager.broadcast({
                "type": "transcription_error",
                "annotation_id": annotation_id,
                "error": str(e)
            })
        except:
            pass


async def process_extended_transcript(annotation_id: int, transcription: str):
    """Background task to process extended transcript using LLM"""
    from llm_service import generate_extended_transcript
    
    try:
        # Update status to processing
        async with db.AsyncSessionLocal() as session:
            await db.update_annotation(
                session,
                annotation_id,
                models.AnnotationUpdate(extended_transcript_status="processing")
            )
        
        # Broadcast status
        await manager.broadcast({
            "type": "extended_transcript_status",
            "annotation_id": annotation_id,
            "status": "processing"
        })
        
        logger.info(f"Starting extended transcript generation for annotation {annotation_id}")
        
        # Generate extended transcript using LLM
        extended_transcript = await generate_extended_transcript(transcription)
        
        if extended_transcript:
            # Update annotation with extended transcript
            async with db.AsyncSessionLocal() as session:
                await db.update_annotation(
                    session,
                    annotation_id,
                    models.AnnotationUpdate(
                        extended_transcript=extended_transcript,
                        extended_transcript_status="completed"
                    )
                )
            
            logger.info(f"Extended transcript completed for annotation {annotation_id}")
            
            # Broadcast completion
            await manager.broadcast({
                "type": "extended_transcript_complete",
                "annotation_id": annotation_id,
                "extended_transcript": extended_transcript
            })
        else:
            raise Exception("LLM returned no extended transcript")
        
    except Exception as e:
        logger.error(f"Extended transcript error for annotation {annotation_id}: {e}")
        
        # Update status to failed
        try:
            async with db.AsyncSessionLocal() as session:
                await db.update_annotation(
                    session,
                    annotation_id,
                    models.AnnotationUpdate(extended_transcript_status="failed")
                )
            
            await manager.broadcast({
                "type": "extended_transcript_error",
                "annotation_id": annotation_id,
                "error": str(e)
            })
        except:
            pass


@app.get("/api/annotations", response_model=List[models.AnnotationResponse])
async def list_annotations(
    video_id: Optional[int] = None,
    session: AsyncSession = Depends(db.get_session)
):
    """Get annotations, optionally filtered by video_id"""
    try:
        if video_id:
            annotations = await db.get_annotations_by_video(session, video_id)
        else:
            # Get all annotations (not typically used)
            annotations = []
        
        response_annotations = [
            models.AnnotationResponse.model_validate(ann) 
            for ann in annotations
        ]
        
        return response_annotations
        
    except Exception as e:
        logger.error(f"Error listing annotations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/annotations/{annotation_id}", response_model=models.AnnotationResponse)
async def get_annotation(
    annotation_id: int,
    session: AsyncSession = Depends(db.get_session)
):
    """Get annotation by ID"""
    try:
        annotation = await db.get_annotation(session, annotation_id)
        if not annotation:
            raise HTTPException(status_code=404, detail="Annotation not found")
        
        return models.AnnotationResponse.model_validate(annotation)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting annotation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/annotations/{annotation_id}", response_model=models.AnnotationResponse)
async def update_annotation(
    annotation_id: int,
    update_data: models.AnnotationUpdate,
    session: AsyncSession = Depends(db.get_session)
):
    """Update annotation (typically transcription)"""
    try:
        annotation = await db.update_annotation(session, annotation_id, update_data)
        if not annotation:
            raise HTTPException(status_code=404, detail="Annotation not found")
        
        return models.AnnotationResponse.model_validate(annotation)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating annotation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/annotations/{annotation_id}")
async def delete_annotation(
    annotation_id: int,
    session: AsyncSession = Depends(db.get_session)
):
    """Delete an annotation"""
    try:
        annotation = await db.get_annotation(session, annotation_id)
        if not annotation:
            raise HTTPException(status_code=404, detail="Annotation not found")
        
        # Delete audio file
        if os.path.exists(annotation.audio_filepath):
            os.remove(annotation.audio_filepath)
        
        # Delete from database
        await db.delete_annotation(session, annotation_id)
        
        logger.info(f"Annotation deleted: ID={annotation_id}")
        
        # Broadcast deletion
        await manager.broadcast({
            "type": "annotation_deleted",
            "annotation_id": annotation_id
        })
        
        return {"status": "success", "message": "Annotation deleted"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting annotation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/annotations/{annotation_id}/feedback")
async def submit_feedback(
    annotation_id: int,
    feedback_data: models.FeedbackRequest,
    session: AsyncSession = Depends(db.get_session)
):
    """Submit user feedback for extended transcript"""
    try:
        # Verify annotation exists
        annotation = await db.get_annotation(session, annotation_id)
        if not annotation:
            raise HTTPException(status_code=404, detail="Annotation not found")
        
        # Convert feedback_choices array to JSON string
        feedback_choices_json = json.dumps(feedback_data.feedback_choices)
        
        # Update annotation with feedback
        await db.update_annotation(
            session,
            annotation_id,
            models.AnnotationUpdate(
                feedback=feedback_data.feedback,
                feedback_choices=feedback_choices_json
            )
        )
        
        logger.info(f"Feedback submitted for annotation {annotation_id}: {'positive' if feedback_data.feedback == 1 else 'negative'}")
        
        return {
            "status": "success",
            "message": "Feedback submitted successfully",
            "annotation_id": annotation_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting feedback: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/export/{video_id}")
async def export_annotations(
    video_id: int,
    session: AsyncSession = Depends(db.get_session)
):
    """Export annotations for a video as JSON"""
    try:
        video = await db.get_video(session, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        
        annotations = await db.get_annotations_by_video(session, video_id)
        
        # Build export data
        export_data = {
            "video_file": video.filename,
            "video_duration": video.duration,
            "annotation_count": len(annotations),
            "export_timestamp": datetime.utcnow().isoformat(),
            "annotations": [
                {
                    "id": ann.id,
                    "start_time": ann.start_time,
                    "end_time": ann.end_time,
                    "duration": ann.end_time - ann.start_time,
                    "transcription": ann.transcription,
                    "extended_transcript": ann.extended_transcript,
                    "feedback": ann.feedback,
                    "feedback_choices": json.loads(ann.feedback_choices) if ann.feedback_choices else None,
                    "audio_file": ann.audio_filename,
                    "created_at": ann.created_at.isoformat()
                }
                for ann in annotations
            ]
        }
        
        # Save export file
        export_filename = f"export_{video.filename}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
        export_path = EXPORTS_DIR / export_filename
        
        async with aiofiles.open(export_path, 'w', encoding='utf-8') as f:
            await f.write(json.dumps(export_data, indent=2, ensure_ascii=False))
        
        logger.info(f"Export created: {export_filename}")
        
        return FileResponse(
            export_path,
            media_type='application/json',
            filename=export_filename
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting annotations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Custom StaticFiles with no-cache headers for development
class NoCacheStaticFiles(StaticFiles):
    """Static files with no-cache headers to prevent browser caching during development"""
    
    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        # Add no-cache headers for CSS, JS, and HTML files
        if path.endswith(('.css', '.js', '.html')):
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
        return response


# ============================================================================
# GOOGLE DRIVE ENDPOINTS
# ============================================================================

@app.get("/api/gdrive/videos")
async def get_gdrive_videos(folder_id: str):
    """
    Get list of video files from a public Google Drive folder
    
    Args:
        folder_id: Google Drive folder ID
        
    Returns:
        List of video file metadata
    """
    try:
        if not folder_id:
            raise HTTPException(status_code=400, detail="folder_id is required")
        
        # Use API key if available, otherwise try without (for truly public folders)
        api_key = GOOGLE_DRIVE_API_KEY if GOOGLE_DRIVE_API_KEY else None
        
        videos = gdrive_service.list_videos_from_folder(folder_id, api_key)
        
        logger.info(f"Retrieved {len(videos)} videos from Google Drive folder {folder_id}")
        return videos
        
    except Exception as e:
        logger.error(f"Error fetching Google Drive videos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/gdrive/video/{file_id}/stream")
async def stream_gdrive_video(file_id: str):
    """
    Stream a video file from Google Drive
    
    Args:
        file_id: Google Drive file ID
        
    Returns:
        Streaming video response
    """
    try:
        api_key = GOOGLE_DRIVE_API_KEY if GOOGLE_DRIVE_API_KEY else None
        
        # Return streaming response that proxies Google Drive video
        async def video_stream():
            async for chunk in gdrive_service.stream_video_from_gdrive(file_id, api_key):
                yield chunk
        
        return StreamingResponse(
            video_stream(),
            media_type="video/mp4",
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600"
            }
        )
        
    except Exception as e:
        logger.error(f"Error streaming Google Drive video: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Mount static files (frontend) with no-cache for development
app.mount("/static", NoCacheStaticFiles(directory=str(FRONTEND_DIR)), name="static")


# Serve index.html at root with no-cache headers
@app.get("/")
async def serve_index():
    """Serve the main index.html file with no-cache headers"""
    response = FileResponse(FRONTEND_DIR / "index.html")
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


# Run the application
if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"Starting server on {HOST}:{PORT}")
    logger.info(f"Open http://localhost:{PORT} in your browser")
    
    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=True,
        log_level="info"
    )
