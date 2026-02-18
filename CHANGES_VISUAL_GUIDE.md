# Visual Guide to Changes

## 1. Fixed Icon Duplication

### Before:
```
[🔄 Reload All] [🔄 Refresh]  ← Both icons looked the same
```

### After:
```
[⚡ Reload All] [🔄 Refresh]  ← Lightning bolt vs. refresh icon - clearly different
```

## 2. New Segmentation Tab

### Tab Navigation
```
[✏️ Elicit] [✂️ Segment] ← New tab added
```

### Segment Tab Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Video Elicitation Tool                          │
│  [+ Add Videos]  [Select Video]                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [✏️ Elicit]  [✂️ Segment]  ← Tab Navigation                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────┐  ┌──────────────────────────────┐ │
│  │  Video Player              │  │  Segmented Videos            │ │
│  │  ┌──────────────────────┐  │  │                              │ │
│  │  │ [Start: 0:15] Set ▶   │  │  │  ┌────────────────────────┐ │ │
│  │  │ [End: 1:30] Set ▶     │  │  │  │ ✂️ Etirage n°2         │ │ │
│  │  │ Duration: 1:15        │  │  │  │ 🕐 0:15 - 1:30 (1:15)  │ │ │
│  │  │ ┌─────────────────┐   │  │  │  │ [▶] [✏️] [🗑️]          │ │ │
│  │  │ │ Segment name    │   │  │  │  └────────────────────────┘ │ │
│  │  │ └─────────────────┘   │  │  │                              │ │
│  │  │ [+ Create] [Clear]    │  │  │  ┌────────────────────────┐ │ │
│  │  └──────────────────────┘  │  │  │ ✂️ Polissage final     │ │ │
│  │                            │  │  │ 🕐 2:00 - 3:45 (1:45)  │ │ │
│  │  ┌────────────────────┐    │  │  │ [▶] [✏️] [🗑️]          │ │ │
│  │  │                    │    │  │  └────────────────────────┘ │ │
│  │  │   Video Player     │    │  │                              │ │
│  │  │                    │    │  │  [🔄 Refresh]               │ │
│  │  └────────────────────┘    │  │                              │ │
│  │                            │  └──────────────────────────────┘ │
│  │  Video: glassblowing.mp4   │                                  │
│  │  Segments: 2               │                                  │
│  └────────────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## 3. Hierarchical Video List

### Before:
```
Select Video
├─ video1.mp4
├─ video2.mp4
└─ video3.mp4
```

### After:
```
Select Video
├─ 📹 video1.mp4                    ← Parent video (bold)
│  ├─ ✂️ Etirage n°2 (0:15-1:30)   ← Segment (indented)
│  └─ ✂️ Polissage (2:00-3:45)     ← Segment (indented)
├─ 📹 video2.mp4                    ← Parent video
└─ 📹 video3.mp4                    ← Parent video (no segments)
```

## 4. Workflow Example

### Creating a Segment:

1. **Switch to Segment Tab**
   - Click [✂️ Segment] tab

2. **Load Video**
   - Video automatically loads if one is selected
   - Or click "Select Video" to choose

3. **Mark Segment Start**
   - Play video to desired start point
   - Click [Set Start] button
   - Start time is captured: "Start: 0:15"

4. **Mark Segment End**
   - Continue playing to end point
   - Click [Set End] button
   - End time captured: "End: 1:30"
   - Duration automatically calculated: "Duration: 1:15"

5. **Name the Segment**
   - Type name in input field: "Etirage n°2"
   - This helps identify what the segment shows

6. **Create Segment**
   - Click [+ Create Segment]
   - Segment appears in right panel
   - Can create multiple segments per video

### Using Segments for Elicitation:

1. **Open Video Selector**
   - Click [Select Video] button

2. **Choose Segment**
   - See parent video with segments listed below
   - Click on segment (e.g., "✂️ Etirage n°2")

3. **Video Loads at Segment**
   - Parent video loads
   - Playback automatically seeks to segment start (0:15)
   - You can now make elicitations focused on that specific moment

## 5. API Endpoints Added

```
POST   /api/segments                    Create new segment
GET    /api/segments/video/{video_id}   List all segments for a video
GET    /api/segments/{segment_id}       Get specific segment
PUT    /api/segments/{segment_id}       Update segment name
DELETE /api/segments/{segment_id}       Delete segment
```

## 6. Database Schema

New table: `video_segments`
```
┌────────────────┬──────────────────────────────────────────────┐
│ Column         │ Description                                  │
├────────────────┼──────────────────────────────────────────────┤
│ id             │ Primary key                                  │
│ parent_video_id│ Foreign key to videos table                  │
│ name           │ User-provided name/tag (e.g., "Etirage n°2") │
│ start_time     │ Start time in seconds (e.g., 15.5)          │
│ end_time       │ End time in seconds (e.g., 90.3)            │
│ thumbnail_path │ Reserved for future thumbnail feature        │
│ created_at     │ Timestamp                                    │
│ updated_at     │ Timestamp                                    │
└────────────────┴──────────────────────────────────────────────┘
```
