"""
Database models and Pydantic schemas for Video Elicitation Annotation Tool
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()

# SQLAlchemy Models (Database)

class Project(Base):
    """Project containing a dataset of videos and annotations"""
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship to videos
    videos = relationship("Video", back_populates="project", cascade="all, delete-orphan")


class Video(Base):
    """Video file metadata"""
    __tablename__ = "videos"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)  # Optional: videos can exist without project
    filename = Column(String, nullable=False)
    filepath = Column(String, nullable=False, unique=True)
    duration = Column(Float, nullable=True)  # in seconds
    file_size = Column(Integer, nullable=True)  # in bytes
    mime_type = Column(String, nullable=True)
    batch_position = Column(Integer, nullable=True)  # Position in batch (0-indexed)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    project = relationship("Project", back_populates="videos")
    annotations = relationship("Annotation", back_populates="video", cascade="all, delete-orphan")


class Annotation(Base):
    """Video annotation with audio and transcription"""
    __tablename__ = "annotations"
    
    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=False)
    start_time = Column(Float, nullable=False)  # in seconds
    end_time = Column(Float, nullable=False)  # in seconds
    audio_filename = Column(String, nullable=False)
    audio_filepath = Column(String, nullable=False)
    transcription = Column(Text, nullable=True)
    transcription_status = Column(String, default="pending")  # pending, processing, completed, failed
    extended_transcript = Column(Text, nullable=True)  # LLM-enhanced transcript
    extended_transcript_status = Column(String, default="pending")  # pending, processing, completed, failed
    feedback = Column(Integer, nullable=True)  # 1 for thumbs up, 0 for thumbs down, null for no feedback
    feedback_choices = Column(String, nullable=True)  # JSON string storing array of 1s and 0s
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship to video
    video = relationship("Video", back_populates="annotations")


# Pydantic Schemas (API Request/Response)

class ProjectCreate(BaseModel):
    """Schema for creating a project"""
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    """Schema for updating a project"""
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    """Schema for project response"""
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    video_count: int = 0
    
    class Config:
        from_attributes = True


class VideoCreate(BaseModel):
    """Schema for creating a video record"""
    filename: str
    filepath: str
    project_id: Optional[int] = None
    batch_position: Optional[int] = None
    duration: Optional[float] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None


class VideoResponse(BaseModel):
    """Schema for video response"""
    id: int
    project_id: Optional[int] = None
    filename: str
    filepath: str
    batch_position: Optional[int] = None
    duration: Optional[float] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    uploaded_at: datetime
    annotation_count: int = 0
    
    class Config:
        from_attributes = True


class AnnotationCreate(BaseModel):
    """Schema for creating an annotation"""
    video_id: int
    start_time: float = Field(..., ge=0)
    end_time: float = Field(..., gt=0)
    audio_filename: str
    audio_filepath: str


class AnnotationUpdate(BaseModel):
    """Schema for updating an annotation"""
    transcription: Optional[str] = None
    transcription_status: Optional[str] = None
    extended_transcript: Optional[str] = None
    extended_transcript_status: Optional[str] = None
    feedback: Optional[int] = None
    feedback_choices: Optional[str] = None


class AnnotationResponse(BaseModel):
    """Schema for annotation response"""
    id: int
    video_id: int
    start_time: float
    end_time: float
    audio_filename: str
    audio_filepath: str
    transcription: Optional[str] = None
    transcription_status: str
    extended_transcript: Optional[str] = None
    extended_transcript_status: str
    feedback: Optional[int] = None
    feedback_choices: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
    
    @property
    def duration(self) -> float:
        """Computed duration field"""
        return self.end_time - self.start_time


class RecordingStartRequest(BaseModel):
    """Schema for starting a recording"""
    video_id: int
    start_time: float = Field(..., ge=0)


class RecordingStopRequest(BaseModel):
    """Schema for stopping a recording"""
    video_id: int
    end_time: float = Field(..., gt=0)
    audio_data: str  # Base64 encoded audio data


class ExportResponse(BaseModel):
    """Schema for export response"""
    video_file: str
    video_duration: Optional[float] = None
    annotation_count: int
    export_timestamp: datetime
    annotations: List[dict]


class FeedbackRequest(BaseModel):
    """Schema for submitting feedback"""
    annotation_id: int
    feedback: int = Field(..., ge=0, le=1)  # 0 for thumbs down, 1 for thumbs up
    feedback_choices: List[int] = Field(..., min_length=5, max_length=6)  # Array of 0s and 1s


class StatusResponse(BaseModel):
    """Generic status response"""
    status: str
    message: str
    data: Optional[dict] = None
