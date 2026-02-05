"""
Database operations for Video Elicitation Annotation Tool
"""
from typing import AsyncGenerator, List, Optional
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.orm import selectinload
from sqlalchemy.future import select
from sqlalchemy import func
from datetime import datetime, timezone

from models import Base, Project, Video, Annotation, Tag, Task, ProjectCreate, ProjectUpdate, VideoCreate, AnnotationCreate, AnnotationUpdate, TagCreate, TaskCreate
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


async def get_session() -> AsyncGenerator[AsyncSession, None]:
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
        # Use exclude_unset=True but keep explicitly set None values
        update_data = annotation_update.model_dump(exclude_unset=True, exclude_none=False)
        for field, value in update_data.items():
            setattr(annotation, field, value)
        annotation.updated_at = datetime.now(timezone.utc)
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


# Project CRUD Operations

async def create_project(session: AsyncSession, project_data: ProjectCreate) -> Project:
    """Create a new project"""
    project = Project(**project_data.model_dump())
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


async def get_project(session: AsyncSession, project_id: int) -> Optional[Project]:
    """Get a project by ID with videos"""
    result = await session.execute(
        select(Project).where(Project.id == project_id).options(selectinload(Project.videos))
    )
    return result.scalar_one_or_none()


async def get_all_projects(session: AsyncSession, skip: int = 0, limit: int = 100) -> List[Project]:
    """Get all projects with pagination"""
    result = await session.execute(
        select(Project)
        .options(selectinload(Project.videos))
        .offset(skip)
        .limit(limit)
        .order_by(Project.updated_at.desc())
    )
    return result.scalars().all()


async def update_project(
    session: AsyncSession,
    project_id: int,
    project_update: ProjectUpdate
) -> Optional[Project]:
    """Update a project"""
    project = await get_project(session, project_id)
    if project:
        update_data = project_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(project, field, value)
        project.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(project)
    return project


async def delete_project(session: AsyncSession, project_id: int) -> bool:
    """Delete a project and all its videos"""
    project = await get_project(session, project_id)
    if project:
        await session.delete(project)
        await session.commit()
        return True
    return False


async def get_videos_by_project(
    session: AsyncSession,
    project_id: int,
    skip: int = 0,
    limit: int = 1000
) -> List[Video]:
    """Get all videos for a specific project, ordered by batch_position"""
    result = await session.execute(
        select(Video)
        .where(Video.project_id == project_id)
        .options(selectinload(Video.annotations))
        .offset(skip)
        .limit(limit)
        .order_by(Video.batch_position.nulls_last(), Video.uploaded_at)
    )
    return result.scalars().all()


# Tag CRUD Operations

async def create_tag(session: AsyncSession, tag_data: TagCreate) -> Tag:
    """Create a new tag"""
    tag = Tag(**tag_data.model_dump())
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag


async def get_tag_by_name(session: AsyncSession, name: str) -> Optional[Tag]:
    """Get a tag by name"""
    result = await session.execute(
        select(Tag).where(Tag.name == name)
    )
    return result.scalar_one_or_none()


async def get_all_tags(session: AsyncSession, skip: int = 0, limit: int = 1000) -> List[Tag]:
    """Get all tags ordered by usage count"""
    result = await session.execute(
        select(Tag)
        .offset(skip)
        .limit(limit)
        .order_by(Tag.usage_count.desc(), Tag.name)
    )
    return result.scalars().all()


async def increment_tag_usage(session: AsyncSession, tag_name: str) -> Optional[Tag]:
    """Increment the usage count for a tag"""
    tag = await get_tag_by_name(session, tag_name)
    if tag:
        tag.usage_count += 1
        tag.updated_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(tag)
    return tag


async def get_or_create_tag(session: AsyncSession, name: str, category: str) -> Tag:
    """Get existing tag or create new one"""
    tag = await get_tag_by_name(session, name)
    if not tag:
        tag_data = TagCreate(name=name, category=category)
        tag = await create_tag(session, tag_data)
    return tag


async def delete_task(session: AsyncSession, name: str, craft: str) -> bool:
    """Delete a task by name and craft"""
    result = await session.execute(select(Task).where((Task.name == name) & (Task.craft == craft)))
    task = result.scalar_one_or_none()
    if task:
        await session.delete(task)
        await session.commit()
        return True
    return False


# Task CRUD Operations

async def create_task(session: AsyncSession, task_data: TaskCreate) -> Task:
    """Create a new task"""
    task = Task(**task_data.model_dump())
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


async def get_task_by_name(session: AsyncSession, name: str) -> Optional[Task]:
    """Get a task by name"""
    result = await session.execute(select(Task).where(Task.name == name))
    return result.scalar_one_or_none()


async def get_tasks(
    session: AsyncSession,
    craft: Optional[str] = None,
    published_only: Optional[bool] = None,
    skip: int = 0,
    limit: int = 1000,
) -> List[Task]:
    """Get tasks with optional craft and published filters"""
    stmt = select(Task)
    if craft:
        stmt = stmt.where(Task.craft == craft)
    if published_only is True:
        stmt = stmt.where(Task.is_published == 1)
    elif published_only is False:
        stmt = stmt.where(Task.is_published == 0)
    result = await session.execute(
        stmt.offset(skip).limit(limit).order_by(Task.is_published.desc(), Task.updated_at.desc())
    )
    return result.scalars().all()
