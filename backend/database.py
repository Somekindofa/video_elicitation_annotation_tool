"""
Database operations for Video Elicitation Annotation Tool
"""
from typing import List, Optional
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.orm import selectinload
from sqlalchemy.future import select
from sqlalchemy import func
from datetime import datetime

from models import Base, Video, Annotation, VideoCreate, AnnotationCreate, AnnotationUpdate
from config import DATABASE_URL


# Create async engine
engine = create_async_engine(DATABASE_URL, echo=False)

# Create async session maker
AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def init_db():
    """Initialize the database, creating all tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncSession:
    """Dependency to get database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


# Video CRUD Operations

async def create_video(session: AsyncSession, video_data: VideoCreate) -> Video:
    """Create a new video record"""
    video = Video(**video_data.model_dump())
    session.add(video)
    await session.commit()
    await session.refresh(video)
    return video


async def get_video(session: AsyncSession, video_id: int) -> Optional[Video]:
    """Get a video by ID"""
    result = await session.execute(
        select(Video).where(Video.id == video_id).options(selectinload(Video.annotations))
    )
    return result.scalar_one_or_none()


async def get_video_by_filepath(session: AsyncSession, filepath: str) -> Optional[Video]:
    """Get a video by filepath"""
    result = await session.execute(
        select(Video).where(Video.filepath == filepath)
    )
    return result.scalar_one_or_none()


async def get_all_videos(session: AsyncSession, skip: int = 0, limit: int = 100) -> List[Video]:
    """Get all videos with pagination"""
    result = await session.execute(
        select(Video)
        .options(selectinload(Video.annotations))
        .offset(skip)
        .limit(limit)
        .order_by(Video.uploaded_at.desc())
    )
    return result.scalars().all()


async def delete_video(session: AsyncSession, video_id: int) -> bool:
    """Delete a video and all its annotations"""
    video = await get_video(session, video_id)
    if video:
        await session.delete(video)
        await session.commit()
        return True
    return False


# Annotation CRUD Operations

async def create_annotation(session: AsyncSession, annotation_data: AnnotationCreate) -> Annotation:
    """Create a new annotation"""
    annotation = Annotation(**annotation_data.model_dump())
    session.add(annotation)
    await session.commit()
    await session.refresh(annotation)
    return annotation


async def get_annotation(session: AsyncSession, annotation_id: int) -> Optional[Annotation]:
    """Get an annotation by ID"""
    result = await session.execute(
        select(Annotation).where(Annotation.id == annotation_id)
    )
    return result.scalar_one_or_none()


async def get_annotations_by_video(
    session: AsyncSession, 
    video_id: int, 
    skip: int = 0, 
    limit: int = 1000
) -> List[Annotation]:
    """Get all annotations for a specific video"""
    result = await session.execute(
        select(Annotation)
        .where(Annotation.video_id == video_id)
        .offset(skip)
        .limit(limit)
        .order_by(Annotation.start_time)
    )
    return result.scalars().all()


async def update_annotation(
    session: AsyncSession, 
    annotation_id: int, 
    annotation_update: AnnotationUpdate
) -> Optional[Annotation]:
    """Update an annotation"""
    annotation = await get_annotation(session, annotation_id)
    if annotation:
        update_data = annotation_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(annotation, field, value)
        annotation.updated_at = datetime.utcnow()
        await session.commit()
        await session.refresh(annotation)
    return annotation


async def delete_annotation(session: AsyncSession, annotation_id: int) -> bool:
    """Delete an annotation"""
    annotation = await get_annotation(session, annotation_id)
    if annotation:
        await session.delete(annotation)
        await session.commit()
        return True
    return False


async def get_annotation_count(session: AsyncSession, video_id: int) -> int:
    """Get count of annotations for a video"""
    result = await session.execute(
        select(func.count(Annotation.id)).where(Annotation.video_id == video_id)
    )
    return result.scalar() or 0


async def get_pending_transcriptions(session: AsyncSession, limit: int = 10) -> List[Annotation]:
    """Get annotations with pending transcriptions"""
    result = await session.execute(
        select(Annotation)
        .where(Annotation.transcription_status == "pending")
        .limit(limit)
        .order_by(Annotation.created_at)
    )
    return result.scalars().all()
