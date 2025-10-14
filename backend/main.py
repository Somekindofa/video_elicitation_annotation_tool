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

from fastapi import FastAPI, File, UploadFile, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
import aiofiles

# Use absolute imports to allow running main.py directly
import database as db
import models
from transcription import transcribe_audio_simple, preload_model, get_model_info
from config import (
    HOST, PORT, CORS_ORIGINS, VIDEOS_DIR, AUDIO_DIR, EXPORTS_DIR,
    STATIC_DIR, FRONTEND_DIR, SUPPORTED_VIDEO_FORMATS, MAX_UPLOAD_SIZE
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
    session: AsyncSession = Depends(db.get_session)
):
    """Serve video file"""
    try:
        video = await db.get_video(session, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        
        if not os.path.exists(video.filepath):
            raise HTTPException(status_code=404, detail="Video file not found on disk")
        
        return FileResponse(video.filepath)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving video file: {e}")
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
        
        # Delete video file
        if os.path.exists(video.filepath):
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


# Mount static files (frontend)
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


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
