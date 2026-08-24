"""
Database models and Pydantic schemas for Video Elicitation Annotation Tool
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import json
from pydantic import BaseModel, Field, field_validator
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
    allowed_cohort_id = Column(Integer, nullable=True, default=None)
    created_at = Column(DateTime, default=datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )

    # Relationship to videos
    videos = relationship(
        "Video", back_populates="project", cascade="all, delete-orphan"
    )


class Video(Base):
    """Video file metadata"""

    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer, ForeignKey("projects.id"), nullable=True
    )  # Optional: videos can exist without project
    filename = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    filepath = Column(String, nullable=False, unique=True)
    duration = Column(Float, nullable=True)  # in seconds
    file_size = Column(Integer, nullable=True)  # in bytes
    mime_type = Column(String, nullable=True)
    batch_position = Column(Integer, nullable=True)  # Position in batch (0-indexed)
    is_local = Column(
        Integer, default=0
    )  # 0 for uploaded (copied), 1 for local (streaming)
    source_type = Column(String, default="uploaded")  # "uploaded", "local", "gdrive"
    external_url = Column(String, nullable=True)  # legacy: OwnCloud/WebDAV URL; kept for schema compat, always NULL in new records
    uploaded_at = Column(DateTime, default=datetime.now(timezone.utc))

    # Relationships
    project = relationship("Project", back_populates="videos")
    annotations = relationship(
        "Annotation", back_populates="video", cascade="all, delete-orphan"
    )
    segments = relationship(
        "VideoSegment", back_populates="parent_video", cascade="all, delete-orphan"
    )


class VideoSegment(Base):
    """Video segment created by user for focused elicitation work"""

    __tablename__ = "video_segments"

    id = Column(Integer, primary_key=True, index=True)
    parent_video_id = Column(
        Integer, ForeignKey("videos.id"), nullable=False
    )  # Reference to original video
    name = Column(String, nullable=True)  # User-provided name/tag (e.g., "Etirage n°2")
    start_time = Column(Float, nullable=False)  # Start time in seconds
    end_time = Column(Float, nullable=False)  # End time in seconds
    thumbnail_path = Column(String, nullable=True)  # Path to thumbnail image
    created_at = Column(DateTime, default=datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )

    # Relationships
    parent_video = relationship("Video", back_populates="segments")


class Tag(Base):
    """Tag for categorizing annotations"""

    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(
        String, nullable=False, unique=True, index=True
    )  # Single word tag (e.g., "scissors", "cutting")
    category = Column(String, nullable=False)  # tool, material, technique, handling
    usage_count = Column(Integer, default=0)  # Track how often this tag is used
    created_at = Column(DateTime, default=datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )


class Task(Base):
    """Task taxonomy for describing the activity in a video"""

    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    craft = Column(
        String, nullable=False, index=True
    )  # e.g., 'glassblowing', 'scientific_glassblowing', 'jewelry'
    description = Column(Text, nullable=True)
    is_published = Column(Integer, default=0)  # 1 published, 0 draft
    created_at = Column(DateTime, default=datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )


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
    transcription_status = Column(
        String, default="pending"
    )  # pending, processing, completed, failed
    language = Column(String, nullable=True)  # ISO 639-1 code detected by Whisper (e.g. "fr", "en", "el")
    # Judge fields: determines if AI review is needed
    judge_status = Column(
        String, default="pending"
    )  # pending, processing, completed, failed
    judge_decision = Column(
        String, nullable=True
    )  # JSON string with needs_review, confidence, reasoning, etc.
    # AI Review fields for elicitation quality assessment
    review_status = Column(
        String, default="pending"
    )  # pending, processing, completed, failed, skipped
    review_results = Column(
        Text, nullable=True
    )  # JSON string storing review dimensions and prompts
    review_timestamp = Column(DateTime, nullable=True)  # When review was completed
    review_attempts = Column(Integer, default=0)  # Track number of review cycles
    is_salient = Column(Integer, default=0)  # 1 if salient moment, else 0
    tags = Column(
        Text, nullable=True
    )  # JSON string storing array of tag names ["scissors", "cutting"]
    tagging_status = Column(
        String, default="pending"
    )  # pending, processing, completed, failed
    tagging_trigger_number = Column(
        Integer, default=0
    )  # Track how many times tagging has been triggered for this annotation
    # Craft/domain for prompt selection (e.g., 'glassblowing', 'jewelry')
    craft = Column(String, nullable=True)
    # Task described in the video segment (free text or chosen from tasks)
    task = Column(String, nullable=True)
    # Automatic task detection via LLM
    detected_task_status = Column(
        String, default="pending"
    )  # pending, processing, completed, failed
    detected_task = Column(
        String, nullable=True
    )  # Auto-detected main task from transcription
    detected_task_confidence = Column(
        Float, default=0.0
    )  # Confidence score (0-1) for detected task
    feedback = Column(
        Integer, nullable=True
    )  # 1 for thumbs up, 0 for thumbs down, null for no feedback
    feedback_choices = Column(
        String, nullable=True
    )  # JSON string storing array of 1s and 0s
    created_at = Column(DateTime, default=datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=datetime.now(timezone.utc),
        onupdate=datetime.now(timezone.utc),
    )

    # Relationship to video
    video = relationship("Video", back_populates="annotations")


# Pydantic Schemas (API Request/Response)


class ProjectCreate(BaseModel):
    """Schema for creating a project"""

    name: str
    description: Optional[str] = None
    allowed_cohort_id: Optional[int] = None


class ProjectUpdate(BaseModel):
    """Schema for updating a project"""

    name: Optional[str] = None
    description: Optional[str] = None
    allowed_cohort_id: Optional[int] = None


class ProjectResponse(BaseModel):
    """Schema for project response"""

    id: int
    name: str
    description: Optional[str] = None
    allowed_cohort_id: Optional[int] = None
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
    is_local: int = 0
    source_type: str = "uploaded"
    user_id: Optional[int] = None


class VideoResponse(BaseModel):
    """Schema for video response"""

    id: int
    project_id: Optional[int] = None
    filename: str
    display_name: Optional[str] = None
    filepath: str
    batch_position: Optional[int] = None
    duration: Optional[float] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    is_local: int = 0
    source_type: str = "uploaded"
    uploaded_at: datetime
    annotation_count: int = 0

    class Config:
        from_attributes = True


class VideoSegmentCreate(BaseModel):
    """Schema for creating a video segment"""

    parent_video_id: int
    name: Optional[str] = None
    start_time: float = Field(..., ge=0)
    end_time: float = Field(..., gt=0)
    thumbnail_path: Optional[str] = None


class VideoSegmentUpdate(BaseModel):
    """Schema for updating a video segment"""

    name: Optional[str] = None
    start_time: Optional[float] = Field(None, ge=0)
    end_time: Optional[float] = Field(None, gt=0)
    thumbnail_path: Optional[str] = None


class VideoSegmentResponse(BaseModel):
    """Schema for video segment response"""

    id: int
    parent_video_id: int
    name: Optional[str] = None
    start_time: float
    end_time: float
    thumbnail_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AnnotationCreate(BaseModel):
    """Schema for creating an annotation"""

    video_id: int
    start_time: float = Field(..., ge=0)
    end_time: float = Field(..., gt=0)
    audio_filename: str
    audio_filepath: str
    craft: Optional[str] = None
    task: Optional[str] = None
    user_id: Optional[int] = 0
    context_id: Optional[int] = 0


class AnnotationUpdate(BaseModel):
    """Schema for updating an annotation"""

    transcription: Optional[str] = None
    transcription_status: Optional[str] = None
    language: Optional[str] = None
    judge_status: Optional[str] = None
    judge_decision: Optional[str] = None
    review_status: Optional[str] = None
    review_results: Optional[str] = None
    review_timestamp: Optional[datetime] = None
    review_attempts: Optional[int] = None
    is_salient: Optional[bool] = None
    tags: Optional[str] = None
    tagging_status: Optional[str] = None
    tagging_trigger_number: Optional[int] = None
    detected_task_status: Optional[str] = None
    detected_task: Optional[str] = None
    detected_task_confidence: Optional[float] = None
    feedback: Optional[int] = None
    feedback_choices: Optional[str] = None
    craft: Optional[str] = None
    task: Optional[str] = None

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags(cls, v):
        """Snake_case-ify user-entered tag names before they hit the DB.

        The client never supplies the final tag name (mirrors create_custom_craft's
        server-derived slug in database_compat.py) - this runs for every caller of
        PUT /api/annotations/{id}, including the manual "+" add-tag flow.
        """
        if v is None:
            return v

        from tagging_service import slugify_tag_name

        if isinstance(v, str):
            try:
                tags = json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return v
        else:
            tags = v

        if not isinstance(tags, list):
            return v

        normalized = []
        for tag in tags:
            if isinstance(tag, dict) and tag.get("name"):
                slug = slugify_tag_name(str(tag["name"]))
                if slug:
                    normalized.append({**tag, "name": slug})
            elif isinstance(tag, str):
                slug = slugify_tag_name(tag)
                if slug:
                    normalized.append(slug)

        return json.dumps(normalized)


class AnnotationResponse(BaseModel):
    """Schema for annotation response"""

    id: int
    video_id: int
    start_time: float
    end_time: float
    audio_filename: Optional[str] = None
    audio_filepath: Optional[str] = None
    transcription: Optional[str] = None
    transcription_status: str
    language: Optional[str] = None
    review_status: str = "pending"
    review_results: Optional[str] = None
    review_timestamp: Optional[datetime] = None
    review_attempts: int = 0
    is_salient: bool = False
    judge_status: str = "pending"
    judge_decision: Optional[str] = None
    tags: Optional[List[Dict[str, Optional[str]]]] = None
    tagging_status: str
    tagging_trigger_number: Optional[int] = 0
    detected_task_status: Optional[str] = "pending"
    detected_task: Optional[str] = None
    detected_task_confidence: Optional[float] = 0.0
    feedback: Optional[int] = None
    feedback_choices: Optional[str] = None
    craft: Optional[str] = None
    task: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tags(cls, v):
        """Parse tags from JSON string to list, handling both old and new formats"""
        if v is None:
            return None

        # Parse JSON string if needed
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except (json.JSONDecodeError, ValueError):
                return None

        # Handle old format: list of strings -> convert to list of objects
        if isinstance(v, list) and len(v) > 0 and isinstance(v[0], str):
            # Convert old format ["tag1", "tag2"] to new format [{"name": "tag1", "category": None}, ...]
            return [{"name": tag, "category": None} for tag in v]

        # New format is already correct
        return v

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
    feedback_choices: List[int] = Field(
        ..., min_length=5, max_length=6
    )  # Array of 0s and 1s


class LocalVideoRegisterRequest(BaseModel):
    """Schema for registering a local video file"""

    filepath: str


class TagCreate(BaseModel):
    """Schema for creating a tag"""

    name: str
    category: str  # tool, material, technique, handling


class TagResponse(BaseModel):
    """Schema for tag response"""

    id: int
    name: str
    category: str
    usage_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    """Schema for creating a task"""

    name: str
    craft: str
    description: Optional[str] = None
    is_published: int = 0


class TaskResponse(BaseModel):
    """Schema for task response"""

    id: int
    name: str
    craft: str
    description: Optional[str] = None
    is_published: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StatusResponse(BaseModel):
    """Generic status response"""

    status: str
    message: str
    data: Optional[dict] = None


class CustomCraftCreate(BaseModel):
    """Input schema for creating a custom craft domain."""
    craft_label: str

    @field_validator('craft_label')
    @classmethod
    def validate_label(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('craft_label must not be empty')
        if len(v) > 100:
            raise ValueError('craft_label must be 100 characters or fewer')
        return v


class CustomCraftResponse(BaseModel):
    """Output schema for a custom craft domain."""
    craft_key: str
    craft_label: str

    model_config = {"from_attributes": True}
