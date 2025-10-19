# Bug Fix: 422 Unprocessable Content Error

## Problem
When clicking "Add" on a local video, got error:
```
POST http://localhost:8005/api/videos/local/register 422 (Unprocessable Content)
Error registering local video: Error: [object Object]
```

## Root Cause
The backend endpoint `/api/videos/local/register` was expecting `filepath` as a simple parameter, but FastAPI couldn't parse it correctly from the JSON body.

## Solution
Created a Pydantic request model to properly handle the JSON body:

### Changes Made

#### 1. Added Pydantic Model (`backend/models.py`)
```python
class LocalVideoRegisterRequest(BaseModel):
    """Schema for registering a local video file"""
    filepath: str
```

#### 2. Updated Endpoint (`backend/main.py`)
**Before:**
```python
async def register_local_video(
    filepath: str,
    session: AsyncSession = Depends(db.get_session)
):
```

**After:**
```python
async def register_local_video(
    request: models.LocalVideoRegisterRequest,
    session: AsyncSession = Depends(db.get_session)
):
    try:
        file_path = Path(request.filepath)  # Changed from filepath to request.filepath
```

## Testing

1. **Restart the server** (important for changes to take effect):
   ```bash
   # Stop current server (Ctrl+C if running)
   start.bat
   ```

2. **Test in browser**:
   - Open http://localhost:8005
   - Click "Browse Local Folder"
   - Enter a folder path with videos
   - Click "Browse Folder"
   - Click "Add" on any video
   - Should now work without 422 error!

3. **Verify with test script**:
   ```bash
   python test_local_streaming.py
   ```

## What This Fixes
✅ Proper JSON body parsing with FastAPI/Pydantic  
✅ Clear request validation  
✅ Better error messages if filepath is missing/invalid  
✅ Type safety with Pydantic model

## Status
🔧 **FIXED** - Server needs to be restarted for changes to take effect
