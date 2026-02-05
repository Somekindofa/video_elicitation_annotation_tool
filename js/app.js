/**
 * Video Elicitation Tool - Frontend Application
 * Main JavaScript file handling all client-side functionality
 */

// Application State
const state = {
    currentVideo: null,
    currentVideoId: null,
    videos: [],
    annotations: [],
    isRecording: false,
    recordingStartTime: null,
    mediaRecorder: null,
    audioChunks: [],
    websocket: null,
    recordingTimer: null,
    projects: [],
    currentProject: null,
    currentTab: 'annotate',
    editingProjectId: null,
    craft: 'glassblowing',
    tasks: [],
    task: '',
    sortBy: 'newest',
    showReviewPanels: {},  // Track which annotation review panels are visible (defaults to hidden)
    // Segmentation state
    segmentVideoId: null,
    segmentVideoElement: null,
    segments: [],
    segmentStartTime: null,
    segmentEndTime: null
};

// API Base URL
const API_BASE = window.location.origin === 'null'
    ? 'http://localhost:8005'
    : window.location.origin;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// Reset interface to initial empty state
function resetInterface() {
    console.log('Resetting interface to empty state...');

    // Clear current video state
    state.currentVideo = null;
    state.currentVideoId = null;
    state.annotations = [];

    // Clear localStorage
    try {
        localStorage.removeItem('currentVideoId');
    } catch (e) {
        console.error('Failed to clear video state:', e);
    }

    // Hide video player and related elements
    document.getElementById('videoPlayerContainer').style.display = 'none';
    document.getElementById('recordingControls').style.display = 'none';
    document.getElementById('videoInfo').style.display = 'none';

    // Show video selector with empty state
    const videoSelector = document.getElementById('videoSelector');
    videoSelector.style.display = 'block';
    videoSelector.className = 'video-selector';

    // Ensure empty state content is present
    videoSelector.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-film empty-icon"></i>
            <h3>No Video Loaded</h3>
            <p>Click "Add Local Videos" to get started</p>
        </div>
    `;

    // Clear annotations panel
    const annotationsList = document.getElementById('annotationsList');
    annotationsList.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-pen-to-square empty-icon"></i>
            <p>No annotations yet</p>
            <p class="hint">Start recording to create your first elicitation</p>
        </div>
    `;

    // Pause and reset video player
    const videoPlayer = document.getElementById('videoPlayer');
    const videoSource = document.getElementById('videoSource');
    videoPlayer.pause();
    videoPlayer.currentTime = 0;
    videoSource.src = '';
    videoPlayer.load(); // Important: reload to clear the source properly

    console.log('Interface reset complete');
}

// Markdown rendering helper
function mdToHtml(text) {
    try {
        const src = text || '';
        if (window.marked && window.DOMPurify) {
            // Enable line breaks like GitHub (single newline -> <br>)
            const rawHtml = window.marked.parse(src, { breaks: true });
            return window.DOMPurify.sanitize(rawHtml);
        }
        // Fallback: escape-less newline conversion (safe because used only as innerHTML in controlled context)
        return (src + '').replace(/\n/g, '<br>');
    } catch (e) {
        console.warn('Markdown render failed, falling back to plain text', e);
        return (text || '').replace(/\n/g, '<br>');
    }
}

async function initializeApp() {
    console.log('Initializing Video Elicitation Tool...');

    // Set up event listeners
    setupEventListeners();

    // Add header title click listener for reset
    const headerTitle = document.getElementById('headerTitle');
    if (headerTitle) {
        headerTitle.addEventListener('click', () => {
            resetInterface();
        });
    }

    // Connect WebSocket
    connectWebSocket();

    // Check microphone permissions
    checkMicrophonePermission();

    // Load craft selection from localStorage (default to glassblowing)
    state.craft = localStorage.getItem('craft') || 'glassblowing';
    // Create selectors UI
    createCraftSelectorUI();

    // Load existing videos
    await loadVideos();

    // Restore previously loaded video if exists
    const savedVideoId = localStorage.getItem('currentVideoId');
    if (savedVideoId) {
        // Verify the video still exists in loaded videos
        const videoExists = state.videos.some(v => v.id === parseInt(savedVideoId));
        if (videoExists) {
            console.log('Restoring previous video:', savedVideoId);
            await loadVideo(parseInt(savedVideoId));
        } else {
            // Video no longer exists, clear saved state
            console.log('Saved video no longer exists, clearing state');
            localStorage.removeItem('currentVideoId');
        }
    }

    console.log('Application initialized successfully');
}

// Create a small craft selector UI under the recording controls
function createCraftSelectorUI() {
    try {
        const controls = document.getElementById('recordingControls');
        if (!controls) return;

        // Create container
        const wrapper = document.createElement('div');
        wrapper.className = 'craft-selector';
        wrapper.style.margin = '10px 0';

        const label = document.createElement('div');
        label.textContent = 'Select your craft domain';
        label.style.fontSize = '0.9rem';
        label.style.marginBottom = '6px';

        const select = document.createElement('select');
        select.id = 'craftSelector';
        select.style.padding = '6px 8px';
        select.style.borderRadius = '4px';
        select.style.border = '1px solid #ccc';

        const opts = [
            { value: 'glassblowing', label: 'Glassblowing' },
            { value: 'scientific_glassblowing', label: 'Scientific Glassblowing' },
            { value: 'jewelry', label: 'Jewelry' }
        ];

        opts.forEach(o => {
            const option = document.createElement('option');
            option.value = o.value;
            option.textContent = o.label;
            select.appendChild(option);
        });

        // Set current value
        select.value = state.craft || 'glassblowing';

        // On change, update state and persist
        select.addEventListener('change', (e) => {
            state.craft = e.target.value;
            try { localStorage.setItem('craft', state.craft); } catch (e) { }
        });

        wrapper.appendChild(label);
        wrapper.appendChild(select);

        // Insert at top of recording controls
        controls.insertBefore(wrapper, controls.firstChild);
    } catch (e) {
        console.error('Failed to create craft selector UI', e);
    }
}


// Event Listeners Setup
function setupEventListeners() {
    console.log('=== Setting up event listeners ===');

    // Video selection
    document.getElementById('selectVideoBtn').addEventListener('click', () => {
        if (state.videos.length > 0) {
            showVideoModal();
        } else {
            showToast('No Videos', 'Please upload videos first', 'info');
        }
    });

    // Add Local Videos - opens file picker for local video registration
    document.getElementById('addVideosBtn').addEventListener('click', handleAddLocalVideos);

    // Handle video file selection for local registration (not upload)
    document.getElementById('videoFileInput').addEventListener('change', handleLocalVideoSelection);

    // Recording
    document.getElementById('recordBtn').addEventListener('click', toggleRecording);

    // Skip buttons
    document.getElementById('skipBackBtn').addEventListener('click', () => {
        const videoPlayer = document.getElementById('videoPlayer');
        videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
    });

    document.getElementById('skipForwardBtn').addEventListener('click', () => {
        const videoPlayer = document.getElementById('videoPlayer');
        videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 10);
    });

    // Video player
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.addEventListener('timeupdate', updateTimeline);
    videoPlayer.addEventListener('loadedmetadata', handleVideoLoaded);

    // Timeline click
    document.getElementById('timelineTrack').addEventListener('click', handleTimelineClick);

    // Export
    document.getElementById('exportBtn').addEventListener('click', exportAnnotations);

    // Refresh annotations
    document.getElementById('refreshAnnotationsBtn').addEventListener('click', () => {
        if (state.currentVideoId) {
            loadAnnotations(state.currentVideoId);
        }
    });

    // Sort annotations
    document.getElementById('sortAnnotationsBtn').addEventListener('click', toggleSortDropdown);
    document.querySelectorAll('.sort-option').forEach(option => {
        option.addEventListener('click', handleSortChange);
    });
    // Reload all analyses
    document.getElementById('reloadAllBtn').addEventListener('click', reloadAllAnalyses);
    // Close sort dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('sortDropdownMenu');
        const sortBtn = document.getElementById('sortAnnotationsBtn');
        if (dropdown && !dropdown.contains(e.target) && !sortBtn.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Modal
    document.getElementById('closeModalBtn').addEventListener('click', closeVideoModal);

    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Projects
    document.getElementById('createProjectBtn').addEventListener('click', openProjectModal);
    document.getElementById('closeProjectModalBtn').addEventListener('click', closeProjectModal);
    document.getElementById('cancelProjectBtn').addEventListener('click', closeProjectModal);
    document.getElementById('projectForm').addEventListener('submit', handleProjectFormSubmit);
    document.getElementById('closeAssignVideosModalBtn').addEventListener('click', closeAssignVideosModal);
    document.getElementById('closeAssignVideosBtn').addEventListener('click', closeAssignVideosModal);

    // Local Folder Browser
    document.getElementById('browseLocalFolderBtn').addEventListener('click', handleBrowseLocalFolder);
    document.getElementById('closeLocalFolderModalBtn').addEventListener('click', closeLocalFolderModal);
    document.getElementById('cancelLocalBtn').addEventListener('click', closeLocalFolderModal);

    // Allow Enter key in folder path input to trigger browse
    document.getElementById('localFolderPath').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleBrowseLocalFolder();
        }
    });
}

// WebSocket Connection
function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

    state.websocket = new WebSocket(wsUrl);

    state.websocket.onopen = () => {
        console.log('WebSocket connected');
    };

    state.websocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
    };

    state.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    state.websocket.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(connectWebSocket, 3000);
    };
}

function handleWebSocketMessage(message) {
    console.log('WebSocket message:', message);

    switch (message.type) {
        case 'annotation_created':
            showToast('Annotation Created', 'Audio recorded successfully', 'success');
            break;

        case 'transcription_status':
            updateAnnotationStatus(message.annotation_id, message.status);
            break;

        case 'transcription_complete':
            updateAnnotationTranscription(message.annotation_id, message.transcription);
            showToast('Transcription Complete', 'Audio has been transcribed', 'success');
            if (state.currentVideoId) {
                loadAnnotations(state.currentVideoId);
            }
            break;

        case 'transcription_error':
            showToast('Transcription Error', message.error, 'error');
            updateAnnotationStatus(message.annotation_id, 'failed');
            break;

        case 'review_status':
            updateReviewStatus(message.annotation_id, message.status);
            break;

        case 'review_complete':
            updateReviewResults(message.annotation_id, message.review_results, message.is_salient);
            if (state.currentVideoId) {
                loadAnnotations(state.currentVideoId);
            }
            break;

        case 'review_error':
            showToast('AI Review Error', message.error, 'error');
            updateReviewStatus(message.annotation_id, 'failed');
            break;

        case 'judge_status':
            updateJudgeStatus(message.annotation_id, message.status);
            break;

        case 'judge_complete':
            updateJudgeDecision(message.annotation_id, message.judge_decision);
            if (state.currentVideoId) {
                loadAnnotations(state.currentVideoId);
            }
            break;

        case 'judge_error':
            showToast('Judge Error', message.error, 'error');
            updateJudgeStatus(message.annotation_id, 'failed');
            break;

        case 'tagging_status':
            updateTaggingStatus(message.annotation_id, message.status);
            break;

        case 'tagging_complete':
            updateTags(message.annotation_id, message.tags);
            if (state.currentVideoId) {
                loadAnnotations(state.currentVideoId);
            }
            break;

        case 'tagging_error':
            showToast('Tagging Error', message.error, 'error');
            updateTaggingStatus(message.annotation_id, 'failed');
            break;

        case 'tagging_debug':
            console.error('[TAGGING DEBUG]', message);
            break;

        case 'task_detection_status':
            // Handle task detection status updates
            console.log('[TASK_DETECTION]', message.status);
            break;

        case 'task_detection_complete':
            // Update annotation with detected task
            const annotation = state.annotations.find(a => a.id === message.annotation_id);
            if (annotation) {
                annotation.detected_task = message.detected_task;
                annotation.detected_task_confidence = message.confidence;
            }
            if (state.currentVideoId) {
                loadAnnotations(state.currentVideoId);
            }
            break;

        case 'task_detection_error':
            showToast('Task Detection Error', message.error, 'error');
            break;

        case 'annotation_deleted':
            if (state.currentVideoId) {
                loadAnnotations(state.currentVideoId);
            }
            break;
    }
}

// Microphone Permission
async function checkMicrophonePermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        updateRecordingStatus('ready', 'Ready to Record');
        console.log('Microphone permission granted');
    } catch (error) {
        console.error('Microphone permission denied:', error);
        showToast('Microphone Access Required', 'Please grant microphone permission to record annotations', 'warning');
        updateRecordingStatus('error', 'Microphone Access Denied');
    }
}

// Handle Add Local Videos button click
async function handleAddLocalVideos() {
    // Check if File System Access API is available (for directory picking)
    if (typeof window.showDirectoryPicker === 'function') {
        try {
            // Use modern File System Access API to let user pick a directory
            const directoryHandle = await window.showDirectoryPicker();

            // Get the directory path - we'll need to reconstruct it
            // Note: The API doesn't directly give us the full path for security,
            // but we can prompt the user to confirm/provide it
            const dirName = directoryHandle.name;

            // Prompt user to provide or confirm the full path
            const folderPath = prompt(
                `Selected folder: "${dirName}"\n\n` +
                `Please enter the complete path to this folder:\n` +
                `(The browser doesn't expose full paths for security)`,
                `C:\\Users\\dupon\\Documents\\${dirName}`
            );

            if (!folderPath) {
                console.log('Folder selection cancelled');
                return;
            }

            // Now browse and register all videos in that folder
            await handleBrowseFolder(folderPath);

        } catch (error) {
            if (error.name === 'AbortError') {
                // User cancelled the picker
                console.log('Folder selection cancelled');
            } else {
                console.error('Error selecting folder:', error);
                showToast('Error', 'Failed to select folder: ' + error.message, 'error');
            }
        }
    } else {
        // Fallback: Open the manual folder path modal
        // Brave and some browsers disable folder picker for privacy
        openLocalFolderModal();
    }
}

// Browse folder and register all videos
async function handleBrowseFolder(folderPath) {
    try {
        showLoading('Browsing folder...');

        const response = await fetch(`${API_BASE}/api/videos/local/browse?directory=${encodeURIComponent(folderPath)}`);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to browse folder');
        }

        const data = await response.json();

        if (data.videos.length === 0) {
            showToast('No Videos', 'No video files found in this folder', 'info');
            hideLoading();
            return;
        }

        // Register all found videos
        let successCount = 0;
        let duplicateCount = 0;

        for (const video of data.videos) {
            try {
                const result = await registerLocalVideo(video.filepath, video.filename);
                if (result) {
                    successCount++;
                } else {
                    duplicateCount++;
                }
            } catch (error) {
                if (error.message.includes('Already Registered') || error.message.includes('UNIQUE constraint')) {
                    duplicateCount++;
                } else {
                    console.error(`Failed to register ${video.filename}:`, error);
                }
            }
        }

        await loadVideos();

        const message = duplicateCount > 0
            ? `${successCount} video(s) registered, ${duplicateCount} already existed`
            : `${successCount} video(s) registered successfully`;
        showToast('Registration Complete', message, 'success');

    } catch (error) {
        console.error('Error browsing folder:', error);
        showToast('Error', error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Local Video Selection - Register local videos without copying
async function handleLocalVideoSelection(event) {
    const files = Array.from(event.target.files);

    if (files.length === 0) return;

    showLoading(`Registering ${files.length} video(s)...`);

    try {
        let successCount = 0;
        let duplicateCount = 0;
        let skippedCount = 0;
        let lastRegisteredVideoId = null;

        for (const file of files) {
            try {
                // Browsers don't expose full file paths for security reasons
                // Try to get path from file object (works in some environments)
                let filepath = file.path;

                if (!filepath) {
                    // Prompt user to provide the full path
                    hideLoading(); // Hide loading while prompting
                    filepath = prompt(
                        `Please enter the full path for "${file.name}":\n\n` +
                        `Example: C:\\Videos\\${file.name}`,
                        `C:\\Videos\\${file.name}`
                    );
                    showLoading(`Registering ${files.length} video(s)...`); // Show loading again

                    if (!filepath) {
                        console.log(`Skipped ${file.name} - no path provided`);
                        skippedCount++;
                        continue;
                    }
                }

                const video = await registerLocalVideo(filepath, file.name);

                if (video) {
                    successCount++;
                    lastRegisteredVideoId = video.id;
                } else {
                    duplicateCount++;
                }
            } catch (error) {
                if (error.message.includes('Already Registered') || error.message.includes('UNIQUE constraint')) {
                    duplicateCount++;
                } else {
                    console.error(`Failed to register ${file.name}:`, error);
                    showToast('Registration Error', `Failed to register ${file.name}: ${error.message}`, 'error');
                }
            }
        }

        // Reload video list
        await loadVideos();

        // Show summary message
        if (successCount > 0) {
            let message = `${successCount} video(s) registered`;
            if (duplicateCount > 0) message += `, ${duplicateCount} already existed`;
            if (skippedCount > 0) message += `, ${skippedCount} skipped`;
            showToast('Registration Complete', message, 'success');

            // Auto-load the last registered video if only one was added
            if (successCount === 1 && lastRegisteredVideoId) {
                await loadVideo(lastRegisteredVideoId);
            }
        } else if (duplicateCount > 0) {
            showToast('Already Registered', `All ${duplicateCount} video(s) were already in your library`, 'info');
        } else if (skippedCount > 0) {
            showToast('No Videos Added', 'No videos were registered', 'info');
        }

    } catch (error) {
        console.error('Local video registration error:', error);
        showToast('Registration Error', error.message, 'error');
    } finally {
        hideLoading();
        event.target.value = ''; // Reset input
    }
}

// Load Videos
async function loadVideos() {
    try {
        const response = await fetch(`${API_BASE}/api/videos`);
        if (!response.ok) throw new Error('Failed to load videos');

        state.videos = await response.json();

    } catch (error) {
        console.error('Error loading videos:', error);
        showToast('Error', 'Failed to load videos', 'error');
    }
}

// Video Modal
async function showVideoModal() {
    const modal = document.getElementById('videoListModal');
    const container = document.getElementById('videoListContainer');

    container.innerHTML = '';

    if (state.videos.length === 0) {
        container.innerHTML = '<p class="empty-state">No videos available</p>';
    } else {
        // Fetch segments for all videos
        const segmentsMap = {};
        for (const video of state.videos) {
            try {
                const response = await fetch(`${API_BASE}/api/segments/video/${video.id}`);
                if (response.ok) {
                    segmentsMap[video.id] = await response.json();
                }
            } catch (error) {
                console.error(`Failed to load segments for video ${video.id}:`, error);
                segmentsMap[video.id] = [];
            }
        }

        // Render videos with hierarchical segments
        state.videos.forEach(video => {
            const videoSegments = segmentsMap[video.id] || [];
            
            // Parent video item
            const item = document.createElement('div');
            item.className = 'video-list-item video-parent';
            if (state.currentVideoId === video.id) {
                item.classList.add('active');
            }

            item.innerHTML = `
                <div class="video-list-name">
                    <i class="fas fa-video"></i> ${video.filename}
                </div>
                <div class="video-list-meta">
                    ${formatFileSize(video.file_size)} • ${video.annotation_count} elicitations
                    ${videoSegments.length > 0 ? ` • ${videoSegments.length} segments` : ''}
                </div>
                <div class="video-list-actions">
                    <button class="btn btn-icon btn-small btn-danger video-delete-btn" title="Delete video" onclick="event.stopPropagation(); deleteVideo(${video.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            item.addEventListener('click', () => {
                loadVideo(video.id);
                closeVideoModal();
            });

            container.appendChild(item);

            // Render segments under parent video
            if (videoSegments.length > 0) {
                videoSegments.forEach(segment => {
                    const segmentItem = document.createElement('div');
                    segmentItem.className = 'video-list-item video-segment';
                    
                    const segmentName = segment.name || 'Unnamed Segment';
                    const duration = segment.end_time - segment.start_time;
                    
                    segmentItem.innerHTML = `
                        <div class="video-list-name segment-name">
                            <i class="fas fa-cut"></i> ${segmentName}
                        </div>
                        <div class="video-list-meta">
                            ${formatTime(segment.start_time)} - ${formatTime(segment.end_time)} (${formatTime(duration)})
                        </div>
                    `;

                    segmentItem.addEventListener('click', () => {
                        loadVideoSegment(video.id, segment);
                        closeVideoModal();
                    });

                    container.appendChild(segmentItem);
                });
            }
        });
    }

    modal.classList.add('active');
}

function closeVideoModal() {
    document.getElementById('videoListModal').classList.remove('active');
}

// Load and Play Video
async function loadVideo(videoId) {
    try {
        showLoading('Loading video...');

        const response = await fetch(`${API_BASE}/api/videos/${videoId}`);
        if (!response.ok) throw new Error('Failed to load video');

        const video = await response.json();
        state.currentVideo = video;
        state.currentVideoId = videoId;

        // Persist current video ID to localStorage
        try {
            localStorage.setItem('currentVideoId', videoId);
        } catch (e) {
            console.error('Failed to save video state:', e);
        }

        // Update UI
        document.getElementById('videoSelector').style.display = 'none';
        document.getElementById('videoPlayerContainer').style.display = 'block';
        document.getElementById('recordingControls').style.display = 'block';
        document.getElementById('videoInfo').style.display = 'flex';

        // Set video source
        const videoPlayer = document.getElementById('videoPlayer');
        const videoSource = document.getElementById('videoSource');
        videoSource.src = `${API_BASE}/api/videos/${videoId}/file`;
        videoPlayer.load();

        // Remove segment end handler when loading full video
        if (videoPlayer._segmentEndHandler) {
            videoPlayer.removeEventListener('timeupdate', videoPlayer._segmentEndHandler);
            videoPlayer._segmentEndHandler = null;
        }

        // Update video info
        document.getElementById('videoName').textContent = video.filename;
        document.getElementById('annotationCount').textContent = video.annotation_count;

        // Load annotations
        await loadAnnotations(videoId);

        showToast('Video Loaded', video.filename, 'success');
    } catch (error) {
        console.error('Error loading video:', error);
        showToast('Error', 'Failed to load video', 'error');
    } finally {
        hideLoading();
    }
}

async function loadVideoSegment(videoId, segment) {
    try {
        showLoading('Loading video segment...');

        // First load the video
        const response = await fetch(`${API_BASE}/api/videos/${videoId}`);
        if (!response.ok) throw new Error('Failed to load video');

        const video = await response.json();
        state.currentVideo = video;
        state.currentVideoId = videoId;

        // Persist current video ID to localStorage
        try {
            localStorage.setItem('currentVideoId', videoId);
        } catch (e) {
            console.error('Failed to save video state:', e);
        }

        // Update UI
        document.getElementById('videoSelector').style.display = 'none';
        document.getElementById('videoPlayerContainer').style.display = 'block';
        document.getElementById('recordingControls').style.display = 'block';
        document.getElementById('videoInfo').style.display = 'flex';

        // Set video source
        const videoPlayer = document.getElementById('videoPlayer');
        const videoSource = document.getElementById('videoSource');
        videoSource.src = `${API_BASE}/api/videos/${videoId}/file`;
        videoPlayer.load();

        // Update video info
        const segmentName = segment.name ? ` - ${segment.name}` : '';
        document.getElementById('videoName').textContent = `${video.filename}${segmentName}`;
        document.getElementById('annotationCount').textContent = video.annotation_count;

        // Load annotations
        await loadAnnotations(videoId);

        // Seek to segment start time once video is loaded
        videoPlayer.addEventListener('loadedmetadata', function seekToSegmentStart() {
            videoPlayer.currentTime = segment.start_time;
            videoPlayer.removeEventListener('loadedmetadata', seekToSegmentStart);
        }, { once: true });

        // Add timeupdate listener to pause at segment end time
        const handleSegmentEnd = function() {
            if (videoPlayer.currentTime >= segment.end_time) {
                videoPlayer.pause();
                videoPlayer.currentTime = segment.end_time;
            }
        };
        
        // Remove any existing segment end listener
        if (videoPlayer._segmentEndHandler) {
            videoPlayer.removeEventListener('timeupdate', videoPlayer._segmentEndHandler);
        }
        
        // Store the handler reference and add the listener
        videoPlayer._segmentEndHandler = handleSegmentEnd;
        videoPlayer.addEventListener('timeupdate', handleSegmentEnd);

        const duration = segment.end_time - segment.start_time;
        showToast('Segment Loaded', `${segment.name || 'Segment'} (${formatTime(duration)})`, 'success');
    } catch (error) {
        console.error('Error loading video segment:', error);
        showToast('Error', 'Failed to load video segment', 'error');
    } finally {
        hideLoading();
    }
}

function handleVideoLoaded() {
    const videoPlayer = document.getElementById('videoPlayer');
    const duration = videoPlayer.duration;
    document.getElementById('durationLabel').textContent = formatTime(duration);
}

// Recording Functions
async function toggleRecording() {
    if (state.isRecording) {
        await stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        state.mediaRecorder = new MediaRecorder(stream);
        state.audioChunks = [];

        state.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                state.audioChunks.push(event.data);
            }
        };

        state.mediaRecorder.onstop = handleRecordingStop;

        state.mediaRecorder.start();
        state.isRecording = true;
        state.recordingStartTime = document.getElementById('videoPlayer').currentTime;
        state.recordingStartWallTime = Date.now(); // Track actual recording time

        // Update UI
        updateRecordingStatus('recording', 'Recording...');
        document.getElementById('recordBtn').classList.add('recording');
        document.getElementById('recordingPulse').style.display = 'block';

        // Start timer
        document.getElementById('recordingTimer').style.display = 'flex';
        startRecordingTimer();

        console.log('Recording started');
    } catch (error) {
        console.error('Error starting recording:', error);
        showToast('Recording Error', 'Failed to start recording', 'error');
    }
}

async function stopRecording() {
    if (!state.mediaRecorder || !state.isRecording) return;

    state.isRecording = false;
    state.mediaRecorder.stop();
    stopRecordingTimer();

    // Stop all audio tracks
    state.mediaRecorder.stream.getTracks().forEach(track => track.stop());

    // Hide recording pulse
    document.getElementById('recordingPulse').style.display = 'none';

    console.log('Recording stopped');
}

async function handleRecordingStop() {
    const recordingEndTime = document.getElementById('videoPlayer').currentTime;

    // Validate recording duration based on actual recording time (not video time)
    const actualRecordingDuration = (Date.now() - state.recordingStartWallTime) / 1000;
    if (actualRecordingDuration < 0.5) {
        showToast('Recording Too Short', 'Please record for at least 0.5 seconds', 'warning');
        // Reset UI
        updateRecordingStatus('ready', 'Ready to Record');
        document.getElementById('recordBtn').classList.remove('recording');
        document.getElementById('recordBtn').disabled = false;
        document.getElementById('recordingTimer').style.display = 'none';
        document.getElementById('recordingPulse').style.display = 'none';
        return;
    }

    // Update UI
    updateRecordingStatus('processing', 'Processing...');
    document.getElementById('recordBtn').classList.remove('recording');
    document.getElementById('recordBtn').classList.add('processing');
    document.getElementById('recordBtn').disabled = true;
    document.getElementById('recordingTimer').style.display = 'none';

    try {
        // Create audio blob
        const audioBlob = new Blob(state.audioChunks, { type: 'audio/wav' });

        // Send to server using FormData
        showLoading('Saving annotation...');

        // Ensure times are properly formatted with sufficient precision
        const startTime = parseFloat(state.recordingStartTime.toFixed(3));
        const endTime = parseFloat(recordingEndTime.toFixed(3));

        // Create FormData for multipart upload
        const formData = new FormData();
        formData.append('audio_blob', audioBlob, 'recording.wav');
        // Attach craft/domain selection so backend can use domain-specific prompts
        try {
            formData.append('craft', state.craft || 'glassblowing');
        } catch (e) {
            console.warn('Could not append craft to FormData', e);
        }


        const response = await fetch(`${API_BASE}/api/annotations?video_id=${state.currentVideoId}&start_time=${startTime}&end_time=${endTime}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Failed to save annotation';
            try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.detail || errorMessage;
            } catch (e) {
                errorMessage = errorText || errorMessage;
            }
            throw new Error(errorMessage);
        }

        const annotation = await response.json();
        console.log('Annotation saved:', annotation);

        // Reload annotations
        await loadAnnotations(state.currentVideoId);

        // Update video info
        const currentCount = parseInt(document.getElementById('annotationCount').textContent);
        document.getElementById('annotationCount').textContent = currentCount + 1;

    } catch (error) {
        console.error('Error saving annotation:', error);
        showToast('Error', 'Failed to save annotation', 'error');
    } finally {
        hideLoading();

        // Reset UI
        updateRecordingStatus('ready', 'Ready to Record');
        document.getElementById('recordBtn').classList.remove('processing');
        document.getElementById('recordBtn').disabled = false;
    }
}

function startRecordingTimer() {
    let seconds = 0;

    state.recordingTimer = setInterval(() => {
        seconds++;
        document.getElementById('timerDisplay').textContent = formatTime(seconds);
    }, 1000);
}

function stopRecordingTimer() {
    if (state.recordingTimer) {
        clearInterval(state.recordingTimer);
        state.recordingTimer = null;
    }
}

function updateRecordingStatus(status, text) {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');

    // Remove all status classes
    statusIndicator.classList.remove('ready', 'recording', 'processing', 'error');

    // Add current status class
    statusIndicator.classList.add(status);
    statusText.textContent = text;
}

// Load Annotations
async function loadAnnotations(videoId) {
    try {
        const response = await fetch(`${API_BASE}/api/annotations?video_id=${videoId}`);
        if (!response.ok) throw new Error('Failed to load annotations');

        state.annotations = await response.json();

        renderAnnotations();
        renderTimeline();
    } catch (error) {
        console.error('Error loading annotations:', error);
        showToast('Error', 'Failed to load annotations', 'error');
    }
}

function renderAnnotations() {
    const container = document.getElementById('annotationsList');

    if (state.annotations.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-pen-to-square empty-icon"></i>
                <p>No elicitation yet</p>
                <p class="hint">Start recording to create your first elicitation</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    // Sort annotations based on current sort option
    const sortedAnnotations = getSortedAnnotations();

    // Render sorted annotations
    sortedAnnotations.forEach(annotation => {
        const item = document.createElement('div');
        item.className = 'annotation-item';
        item.dataset.id = annotation.id;

        const duration = annotation.end_time - annotation.start_time;
        const statusText = getStatusText(annotation.transcription_status);
        const statusClass = annotation.transcription_status;

        // AI Review Panel UI logic
        let reviewPanelHTML = '';
        if (annotation.transcription && annotation.transcription_status === 'completed') {
            // First check if judge has run and decided review is NOT needed
            if (annotation.judge_status === 'completed' && annotation.judge_decision) {
                try {
                    const judge = typeof annotation.judge_decision === 'string' 
                        ? JSON.parse(annotation.judge_decision) 
                        : annotation.judge_decision;
                    
                    if (judge.needs_review === false) {
                        // Judge says review not needed - show manual button with hint
                        const manualTriggerHtml = `
                            <div class="judge-decision">
                                <div class="judge-message">
                                    <i class="fa-solid fa-check-circle"></i>
                                    <span>AI found this elicitation complete</span>
                                </div>
                                <button class="btn btn-secondary btn-small" onclick="triggerManualReview(${annotation.id}, event)">
                                    <i class="fa-solid fa-magnifying-glass"></i>
                                    Force Review
                                </button>
                                <div class="judge-reasoning" style="display: none;">
                                    <strong>Assessment:</strong> ${judge.reasoning}
                                </div>
                            </div>
                        `;
                        reviewPanelHTML = renderReviewContainer(annotation.id, manualTriggerHtml, 'Complet');
                    } else if (judge.needs_review === true) {
                        // Judge says review IS needed - will auto-trigger, so show processing or results
                        if (annotation.review_status === 'processing') {
                            const progressHtml = `
                                <div class="review-progress">
                                    <i class="fa-solid fa-magnifying-glass"></i>
                                    <span>AI analyzing elicitation</span>
                                    <span class="ellipsis">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </span>
                                </div>
                            `;
                            reviewPanelHTML = renderReviewContainer(annotation.id, progressHtml, 'En cours');
                        } else if (annotation.review_status === 'completed' && annotation.review_results) {
                            try {
                                const review = typeof annotation.review_results === 'string' 
                                    ? JSON.parse(annotation.review_results) 
                                    : annotation.review_results;
                                reviewPanelHTML = renderReviewPanel(annotation.id, review);
                            } catch (e) {
                                console.error('Failed to parse review results:', e);
                            }
                        }
                    }
                } catch (e) {
                    console.error('Failed to parse judge decision:', e);
                }
            } else if (annotation.judge_status === 'processing') {
                // Judge is running
                const judgeProgressHtml = `
                    <div class="judge-progress">
                        <i class="fa-solid fa-gavel"></i>
                        <span>AI evaluating elicitation</span>
                    </div>
                `;
                reviewPanelHTML = renderReviewContainer(annotation.id, judgeProgressHtml, 'Évaluation');
            } else if (annotation.judge_status === 'pending' || annotation.judge_status === 'failed' || !annotation.judge_status) {
                // Judge failed or hasn't run - fall back to direct review trigger
                if (annotation.review_status === 'processing') {
                    const progressHtml = `
                        <div class="review-progress">
                            <i class="fa-solid fa-magnifying-glass"></i>
                            <span>AI analyzing elicitation</span>
                            <span class="ellipsis">
                                <span></span>
                                <span></span>
                                <span></span>
                            </span>
                        </div>
                    `;
                    reviewPanelHTML = renderReviewContainer(annotation.id, progressHtml, 'En cours');
                } else if (annotation.review_status === 'completed' && annotation.review_results) {
                    try {
                        const review = typeof annotation.review_results === 'string' 
                            ? JSON.parse(annotation.review_results) 
                            : annotation.review_results;
                        reviewPanelHTML = renderReviewPanel(annotation.id, review);
                    } catch (e) {
                        console.error('Failed to parse review results:', e);
                    }
                } else if (annotation.review_status === 'pending' || annotation.review_status === 'failed') {
                    const triggerHtml = `
                        <div class="review-trigger">
                            <button class="btn btn-review" onclick="triggerReview(${annotation.id})">
                                <i class="fa-solid fa-magnifying-glass"></i>
                                ${annotation.review_status === 'failed' ? 'Retry AI Review' : 'Trigger AI Review'}
                            </button>
                        </div>
                    `;
                    const statusLabel = annotation.review_status === 'failed' ? 'Échec' : 'En attente';
                    reviewPanelHTML = renderReviewContainer(annotation.id, triggerHtml, statusLabel);
                }
            }
        }

        // Tags UI logic
        let tagsHTML = '';
        if (annotation.review_status === 'completed') {
            if (annotation.tagging_status === 'processing') {
                tagsHTML = `
                    <div class="tagging-progress">
                        <i class="fa-solid fa-tag"></i>
                        <span>Tagging in progress...</span>
                    </div>
                `;
            } else if (annotation.tagging_status === 'completed' && annotation.tags && annotation.tags.length > 0) {
                tagsHTML = `<div class="annotation-tags">`;

                annotation.tags.forEach((tag, index) => {
                    const categoryClass = tag.category ? `category-${tag.category}` : '';
                    tagsHTML += `
                        <span class="annotation-tag ${categoryClass}" title="${tag.category || 'tag'} - Click to delete" onclick="deleteTag(event, ${annotation.id}, ${index})">
                            ${tag.name}
                        </span>
                    `;
                });

                tagsHTML += `</div>`;
            }
        }

        item.innerHTML = `
            <div class="annotation-header">
                <div class="annotation-time-wrapper">
                    <span class="annotation-time">
                        ${formatTime(annotation.start_time)} - ${formatTime(annotation.end_time)}
                        (${duration.toFixed(1)}s)
                    </span>
                    ${annotation.task || annotation.detected_task ? `
                        <span class="detected-task-badge editable" 
                              onclick="startEditTask(${annotation.id})"
                              title="Click to edit task">
                            <strong id="task-display-${annotation.id}">${annotation.task || annotation.detected_task}</strong>
                            <i class="fas fa-pencil-alt task-edit-icon"></i>
                        </span>
                    ` : ''}
                </div>
                <div class="annotation-actions">
                    <button class="btn btn-icon btn-small play-btn" onclick="seekToAnnotation(${annotation.start_time})" title="Jump to time">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn btn-icon btn-small" onclick="startEditTranscription(${annotation.id})" title="Edit transcription">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="btn btn-icon btn-small" onclick="deleteAnnotation(${annotation.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="annotation-transcription">
                ${annotation.transcription || '<em>Transcription pending...</em>'}
            </div>
            <div class="annotation-status-row">
                <div class="annotation-status ${statusClass}">
                    ${statusText}
                </div>
                ${annotation.transcription_status === 'completed' ? `
                    <button class="btn btn-icon btn-tiny" onclick="event.stopPropagation(); triggerTagging(${annotation.id});" title="Relaunch tagging">
                        <i class="fa-solid fa-tags"></i>
                    </button>
                ` : ''}
            </div>
            ${tagsHTML}
            ${reviewPanelHTML}
        `;

        container.appendChild(item);
    });
}

function getFirstTagByCategory(tags, categories) {
    if (!Array.isArray(tags)) return null;
    return tags.find(tag => tag && categories.includes(tag.category)) || null;
}

function getSalientMetadata(tags) {
    const gestureTag = getFirstTagByCategory(tags, ['technique', 'handling']);
    const toolTag = getFirstTagByCategory(tags, ['tool']);
    const materialTag = getFirstTagByCategory(tags, ['material']);

    return {
        gesture: gestureTag ? gestureTag.name : null,
        tool: toolTag ? toolTag.name : null,
        material: materialTag ? materialTag.name : null
    };
}

function renderTimeline() {
    const track = document.getElementById('timelineTrack');
    const videoPlayer = document.getElementById('videoPlayer');
    const duration = videoPlayer.duration;

    if (!duration) return;

    // Clear existing segments only (keep progress bar and playhead)
    track.querySelectorAll('.timeline-segment').forEach(el => el.remove());

    // Add annotation vertical bars at start_time
    state.annotations.forEach(annotation => {
        const bar = document.createElement('div');
        bar.className = 'timeline-segment';
        bar.dataset.id = annotation.id;

        // if (annotation.transcription_status === 'processing' || annotation.tagging_status === 'processing') {
        //     bar.classList.add('processing');
        // }
        // TO BE REPLACED
        if (annotation.transcription_status === 'processing') {
            bar.classList.add('processing');
        }
        if (annotation.is_salient) {
            bar.classList.add('salient');
        }

        // Position bar at start_time (vertical bar, not segment)
        const startPercent = (annotation.start_time / duration) * 100;
        bar.style.left = `${startPercent}%`;

        // Add persistent timestamp label
        const timeLabel = document.createElement('div');
        timeLabel.className = 'timeline-segment-label';
        timeLabel.textContent = formatTime(annotation.start_time);
        bar.appendChild(timeLabel);

        // Build tooltip content
        const tooltip = document.createElement('div');
        tooltip.className = 'timeline-tooltip';

        // Time range
        const timeSpan = document.createElement('span');
        timeSpan.className = 'timeline-tooltip-time';
        timeSpan.textContent = `${formatTime(annotation.start_time)} - ${formatTime(annotation.end_time)}`;
        tooltip.appendChild(timeSpan);

        // Transcription preview (first 100 chars)
        if (annotation.transcription) {
            const transcriptDiv = document.createElement('div');
            transcriptDiv.className = 'timeline-tooltip-transcript';
            const preview = annotation.transcription.length > 100
                ? annotation.transcription.substring(0, 100) + '...'
                : annotation.transcription;
            transcriptDiv.textContent = preview;
            tooltip.appendChild(transcriptDiv);
        }

        if (annotation.is_salient) {
            const salientMeta = getSalientMetadata(annotation.tags);
            const salientBlock = document.createElement('div');
            salientBlock.className = 'timeline-tooltip-salient';

            const salientTitle = document.createElement('div');
            salientTitle.className = 'timeline-tooltip-salient-title';
            salientTitle.textContent = 'Salient moment';
            salientBlock.appendChild(salientTitle);

            const addMetaRow = (label, value) => {
                const row = document.createElement('div');
                row.className = 'timeline-tooltip-salient-row';

                const labelSpan = document.createElement('span');
                labelSpan.className = 'timeline-tooltip-salient-label';
                labelSpan.textContent = label;

                const valueSpan = document.createElement('span');
                valueSpan.className = 'timeline-tooltip-salient-value';
                valueSpan.textContent = value || '—';

                row.appendChild(labelSpan);
                row.appendChild(valueSpan);
                salientBlock.appendChild(row);
            };

            addMetaRow('Gesture', salientMeta.gesture);
            addMetaRow('Tool', salientMeta.tool);
            addMetaRow('Material', salientMeta.material);

            tooltip.appendChild(salientBlock);
        }

        // Tags section
        if (annotation.tags && annotation.tags.length > 0) {
            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'timeline-tooltip-tags';

            annotation.tags.forEach(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.className = 'timeline-tooltip-tag';
                if (tag.category) {
                    tagSpan.classList.add(`category-${tag.category}`);
                }
                tagSpan.textContent = tag.name;
                tagsContainer.appendChild(tagSpan);
            });

            tooltip.appendChild(tagsContainer);
        } else if (annotation.tagging_status === 'completed') {
            // No tags but tagging was completed
            const noTags = document.createElement('div');
            noTags.className = 'timeline-tooltip-no-tags';
            noTags.textContent = 'No tags generated';
            tooltip.appendChild(noTags);
        } else if (annotation.tagging_status === 'processing') {
            // Still processing tags
            const processingTags = document.createElement('div');
            processingTags.className = 'timeline-tooltip-no-tags';
            processingTags.textContent = 'Generating tags...';
            tooltip.appendChild(processingTags);
        }

        bar.appendChild(tooltip);

        // Click to seek
        bar.addEventListener('click', (e) => {
            e.stopPropagation();
            seekToAnnotation(annotation.start_time);
        });

        track.appendChild(bar);
    });

    // Ensure progress indicator is on top
    const playhead = document.getElementById('timelinePlayhead');
    if (playhead && playhead.parentNode === track) {
        track.appendChild(playhead);
    }
}

function updateTimeline() {
    const videoPlayer = document.getElementById('videoPlayer');
    const currentTime = videoPlayer.currentTime;
    const duration = videoPlayer.duration;

    document.getElementById('currentTimeLabel').textContent = formatTime(currentTime);

    if (duration) {
        document.getElementById('durationLabel').textContent = formatTime(duration);

        // Update progress indicator
        const progressPercent = (currentTime / duration) * 100;
        let progressBar = document.getElementById('timelineProgress');
        let playhead = document.getElementById('timelinePlayhead');

        if (!progressBar) {
            // Create progress bar if it doesn't exist
            const track = document.getElementById('timelineTrack');
            progressBar = document.createElement('div');
            progressBar.id = 'timelineProgress';
            progressBar.className = 'timeline-progress';
            track.insertBefore(progressBar, track.firstChild);
        }

        if (!playhead) {
            // Create playhead if it doesn't exist
            const track = document.getElementById('timelineTrack');
            playhead = document.createElement('div');
            playhead.id = 'timelinePlayhead';
            playhead.className = 'timeline-playhead';
            track.appendChild(playhead);
        }

        progressBar.style.width = `${progressPercent}%`;
        playhead.style.left = `${progressPercent}%`;
    }
}

function handleTimelineClick(event) {
    const track = event.currentTarget;
    const rect = track.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percent = clickX / rect.width;

    const videoPlayer = document.getElementById('videoPlayer');
    const duration = videoPlayer.duration;

    if (duration) {
        videoPlayer.currentTime = duration * percent;
    }
}

function seekToAnnotation(time) {
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.currentTime = time;
    videoPlayer.play();
}

async function deleteAnnotation(annotationId) {
    if (!confirm('Are you sure you want to delete this annotation?')) {
        return;
    }

    try {
        showLoading('Deleting annotation...');

        const response = await fetch(`${API_BASE}/api/annotations/${annotationId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete annotation');

        await loadAnnotations(state.currentVideoId);

        // Update count
        const currentCount = parseInt(document.getElementById('annotationCount').textContent);
        document.getElementById('annotationCount').textContent = Math.max(0, currentCount - 1);

        showToast('Deleted', 'Annotation deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting annotation:', error);
        showToast('Error', 'Failed to delete annotation', 'error');
    } finally {
        hideLoading();
    }
}

async function deleteTag(event, annotationId, tagIndex) {
    event.stopPropagation();
    
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (!annotation || !annotation.tags) return;

    const tag = annotation.tags[tagIndex];
    if (!tag) return;

    try {
        // Remove tag from array
        annotation.tags.splice(tagIndex, 1);

        // Update annotation with new tags array
        const response = await fetch(`${API_BASE}/api/annotations/${annotationId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tags: JSON.stringify(annotation.tags, null, 2)
            })
        });

        if (!response.ok) {
            throw new Error('Failed to delete tag');
        }

        // Reload annotations to reflect changes
        await loadAnnotations(state.currentVideoId);
        showToast('Tag Deleted', `Removed tag: ${tag.name}`, 'success');
    } catch (error) {
        console.error('Error deleting tag:', error);
        showToast('Error', 'Failed to delete tag', 'error');
        // Reload to restore original state
        await loadAnnotations(state.currentVideoId);
    }
}

function updateAnnotationStatus(annotationId, status) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.transcription_status = status;
        renderAnnotations();
        renderTimeline();
    }
}

function updateAnnotationTranscription(annotationId, transcription) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.transcription = transcription;
        annotation.transcription_status = 'completed';
        renderAnnotations();
        renderTimeline();
    }
}

// Inline task editing
function startEditTask(annotationId) {
    const badge = document.querySelector(`#task-display-${annotationId}`);
    if (!badge) {
        // Empty state - create input in badge's parent
        const emptyBadge = event.target.closest('.detected-task-badge');
        if (!emptyBadge) return;
        
        const annotation = state.annotations.find(a => a.id === annotationId);
        const currentTask = annotation?.task || annotation?.detected_task || '';
        
        createTaskEditor(emptyBadge, annotationId, currentTask);
        return;
    }

    // Prevent multiple editors
    if (document.querySelector(`.task-editor-${annotationId}`)) return;

    const annotation = state.annotations.find(a => a.id === annotationId);
    const currentTask = annotation?.task || annotation?.detected_task || '';

    const badgeParent = badge.closest('.detected-task-badge');
    createTaskEditor(badgeParent, annotationId, currentTask);
}

function createTaskEditor(badgeElement, annotationId, currentTask) {
    // Hide the badge
    badgeElement.style.display = 'none';

    // Create editor
    const editor = document.createElement('span');
    editor.className = `detected-task-badge task-editor task-editor-${annotationId}`;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'task-edit-input';
    input.value = currentTask;
    input.placeholder = 'Enter task name';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'task-edit-save';
    saveBtn.innerHTML = '<i class="fas fa-check"></i>';
    saveBtn.title = 'Save';
    
    const clearBtn = document.createElement('button');
    clearBtn.className = 'task-edit-clear';
    clearBtn.innerHTML = '<i class="fas fa-trash"></i>';
    clearBtn.title = 'Clear task';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'task-edit-cancel';
    cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
    cancelBtn.title = 'Cancel';
    
    // Event handlers
    saveBtn.onclick = (e) => {
        e.stopPropagation();
        saveTaskEdit(annotationId, input.value.trim());
    };
    
    clearBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('Clear this task?')) {
            saveTaskEdit(annotationId, null);
        }
    };
    
    cancelBtn.onclick = (e) => {
        e.stopPropagation();
        cancelTaskEdit(annotationId);
    };
    
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTaskEdit(annotationId, input.value.trim());
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelTaskEdit(annotationId);
        }
    };
    
    editor.appendChild(input);
    editor.appendChild(saveBtn);
    editor.appendChild(clearBtn);
    editor.appendChild(cancelBtn);
    
    badgeElement.parentNode.insertBefore(editor, badgeElement.nextSibling);
    input.focus();
    input.select();
}

async function saveTaskEdit(annotationId, newTask) {
    try {
        const payload = { task: newTask || null };

        const response = await fetch(`${API_BASE}/api/annotations/${annotationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(errText || 'Failed to save task');
        }

        const updated = await response.json();

        // Update local state
        const annotation = state.annotations.find(a => a.id === annotationId);
        if (annotation) {
            annotation.task = updated.task;
            annotation.updated_at = updated.updated_at;
        }

        // Remove editor and re-render
        renderAnnotations();
        renderTimeline();
        showToast('Saved', 'Task updated', 'success');

    } catch (error) {
        console.error('Error saving task:', error);
        showToast('Error', 'Failed to save task', 'error');
        cancelTaskEdit(annotationId);
    }
}

function cancelTaskEdit(annotationId) {
    const editor = document.querySelector(`.task-editor-${annotationId}`);
    if (editor) {
        editor.remove();
    }
    
    // Show the badge again
    const badge = document.querySelector(`#task-display-${annotationId}`)?.closest('.detected-task-badge');
    if (badge) {
        badge.style.display = '';
    } else {
        // Empty state badge
        const emptyBadge = document.querySelector(`.detected-task-badge.empty`);
        if (emptyBadge) {
            emptyBadge.style.display = '';
        }
    }
}

// Inline transcription editing
function startEditTranscription(annotationId) {
    const item = document.querySelector(`.annotation-item[data-id="${annotationId}"]`);
    if (!item) return;

    const transcriptionDiv = item.querySelector('.annotation-transcription');
    if (!transcriptionDiv) return;

    // Prevent multiple editors
    if (item.querySelector('.transcription-editor')) return;

    const originalText = transcriptionDiv.textContent.trim();

    // Create editor elements
    const editor = document.createElement('div');
    editor.className = 'transcription-editor';

    const textarea = document.createElement('textarea');
    textarea.className = 'transcription-textarea';
    textarea.value = (originalText === 'Transcription pending...' || originalText === '') ? '' : originalText;

    const actions = document.createElement('div');
    actions.className = 'transcription-editor-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary btn-small';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => saveTranscriptionEdit(annotationId, textarea.value, item));

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary btn-small';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => cancelTranscriptionEdit(item, transcriptionDiv, originalText));

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);

    editor.appendChild(textarea);
    editor.appendChild(actions);

    // Replace transcriptionDiv content with editor
    transcriptionDiv.style.display = 'none';
    transcriptionDiv.parentNode.insertBefore(editor, transcriptionDiv.nextSibling);

    textarea.focus();
}

async function saveTranscriptionEdit(annotationId, newText, itemElement) {
    try {
        showLoading('Saving transcription...');

        const payload = { transcription: newText };

        const response = await fetch(`${API_BASE}/api/annotations/${annotationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(errText || 'Failed to save transcription');
        }

        const updated = await response.json();

        // Update local state
        const annotation = state.annotations.find(a => a.id === annotationId);
        if (annotation) {
            annotation.transcription = updated.transcription;
            annotation.updated_at = updated.updated_at;
            annotation.transcription_status = updated.transcription_status || annotation.transcription_status;
        }

        // Remove editor and re-render
        renderAnnotations();
        renderTimeline();
        showToast('Saved', 'Transcription updated', 'success');

    } catch (error) {
        console.error('Error saving transcription edit:', error);
        showToast('Error', 'Failed to save transcription', 'error');
    } finally {
        hideLoading();
    }
}

// AI Review Functions

function renderReviewContainer(annotationId, innerHtml, statusLabel = null) {
    const isVisible = state.showReviewPanels[annotationId] || false;
    const statusBadge = statusLabel
        ? `<span class="review-status-badge">${statusLabel}</span>`
        : '';

    return `
        <div class="review-panel-container">
            <div class="review-toggle-header" onclick="toggleReviewPanel(${annotationId})">
                <span class="review-toggle-label">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    AI Review
                    ${statusBadge}
                </span>
                <span class="review-toggle-indicator">
                    <i class="fa-solid fa-chevron-${isVisible ? 'up' : 'down'}"></i>
                </span>
            </div>
            <div class="review-panel ${isVisible ? 'visible' : 'hidden'}" id="review-panel-${annotationId}">
                ${innerHtml}
            </div>
        </div>
    `;
}

function renderReviewPanel(annotationId, review) {
    const coveredCount = Object.values(review.dimensions).filter(d => d.covered).length;
    const completenessPercent = review.completeness_score || 0;
    
    let dimensionsHTML = '';
    ['HOW', 'EVALUATION', 'FEEDBACK'].forEach(dimName => {
        const dim = review.dimensions[dimName];
        if (!dim) return;
        
        const covered = dim.covered;
        const statusIcon = covered ? '✓' : '✗';
        const statusClass = covered ? 'complete' : 'incomplete';
        
        // Show what's good (explainability)
        const whatIsGoodHTML = dim.what_is_good && dim.what_is_good.length > 0
            ? `<div class="what-is-good">
                <strong>✓ Ce qui est bien :</strong>
                <ul>
                    ${dim.what_is_good.map(item => `<li>${item}</li>`).join('')}
                </ul>
            </div>`
            : '';
        
        const promptsHTML = !covered && dim.prompts && dim.prompts.length > 0 
            ? `<div class="prompts-list">
                ${dim.prompts.map(prompt => `
                    <div class="prompt-item">
                        <span>${prompt}</span>
                    </div>
                `).join('')}
            </div>`
            : '';
        
        dimensionsHTML += `
            <div class="dimension-card ${statusClass}" onclick="toggleDimension(${annotationId}, '${dimName}')">
                <div class="dimension-header">
                    <strong>${statusIcon} ${dimName}</strong>
                    <span>${covered ? 'Complet' : 'Incomplet'}</span>
                </div>
                <div class="dimension-content" id="dim-${annotationId}-${dimName}" style="display: none;">
                    ${whatIsGoodHTML}
                    ${!covered && dim.missing_elements ? `
                        <p class="missing-elements"><em>Manque: ${dim.missing_elements.join(', ')}</em></p>
                    ` : ''}
                    ${promptsHTML}
                </div>
            </div>
        `;
    });
    
    const readyToComplete = review.ready_to_proceed;
    const isVisible = state.showReviewPanels[annotationId] || false;
    const tier = review.completeness_tier || 'MINIMAL';
    const tierLabels = {
        'MINIMAL': 'Minimal',
        'PARTIAL': 'Partiel',
        'SUBSTANTIAL': 'Substantiel',
        'COMPLETE': 'Complet'
    };
    const tierColors = {
        'MINIMAL': '#dc3545',
        'PARTIAL': '#ffc107',
        'SUBSTANTIAL': '#17a2b8',
        'COMPLETE': '#28a745'
    };
    
    return `
        <div class="review-panel-container">
            <div class="review-toggle-header" onclick="toggleReviewPanel(${annotationId})">
                <span class="review-toggle-label">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    AI Review
                    <span class="tier-badge" style="background-color: ${tierColors[tier]}">
                        ${tierLabels[tier]}
                    </span>
                </span>
                <span class="review-toggle-indicator">
                    <i class="fa-solid fa-chevron-${isVisible ? 'up' : 'down'}"></i>
                </span>
            </div>
            <div class="review-panel ${isVisible ? 'visible' : 'hidden'}" id="review-panel-${annotationId}">
                <div class="review-header-row">
                    <div class="review-header">
                        ${review.sensations_analysis ? `
                        <div class="sensations-badges">
                            ${review.sensations_analysis.visual_mentioned ? '<span class="sensation-badge visual"><i class="fa-solid fa-eye"></i> Visuel</span>' : ''}
                            ${review.sensations_analysis.tactile_mentioned ? '<span class="sensation-badge tactile"><i class="fa-solid fa-hand"></i> Tactile</span>' : ''}
                            ${review.sensations_analysis.auditory_mentioned ? '<span class="sensation-badge auditory"><i class="fa-solid fa-ear"></i> Auditif</span>' : ''}
                            ${review.sensations_analysis.proprioceptive_mentioned ? '<span class="sensation-badge proprioceptive"><i class="fa-solid fa-person"></i> Proprioceptif</span>' : ''}
                        </div>
                    ` : ''}
                    </div>
                    <button class="btn btn-icon btn-tiny" onclick="triggerReview(${annotationId})" title="Relaunch AI Review">
                        <i class="fa-solid fa-arrow-rotate-right"></i>
                    </button>
                </div>
                ${dimensionsHTML}
                <div class="review-actions">
                    <button class="btn edit-elicitation-btn" onclick="editElicitation(${annotationId})">
                        <i class="fa-solid fa-pencil"></i>
                        Modifier l'élicitation
                    </button>
                    <button class="btn mark-complete-btn ${readyToComplete ? '' : 'disabled'}" 
                        onclick="markElicitationComplete(${annotationId})"
                        ${readyToComplete ? '' : 'disabled'}>
                        <i class="fa-solid fa-check"></i>
                        Marquer comme complet
                    </button>
                </div>
            </div>
        </div>
    `;
}

function toggleDimension(annotationId, dimName) {
    const content = document.getElementById(`dim-${annotationId}-${dimName}`);
    if (content) {
        const isVisible = content.style.display !== 'none';
        content.style.display = isVisible ? 'none' : 'block';
    }
}

function toggleReviewPanel(annotationId) {
    // Toggle state
    state.showReviewPanels[annotationId] = !state.showReviewPanels[annotationId];
    
    // Re-render to update UI
    renderAnnotations();
}

async function reloadAllAnalyses() {
    if (!state.currentVideoId) {
        showToast('Error', 'No video loaded', 'error');
        return;
    }

    const annotations = Array.isArray(state.annotations) ? state.annotations : [];
    if (annotations.length === 0) {
        showToast('Info', 'No annotations to reload', 'info');
        return;
    }

    const eligible = annotations.filter(a => a && a.transcription && a.transcription.trim());
    const skipped = annotations.length - eligible.length;

    if (eligible.length === 0) {
        showToast('Info', 'No transcriptions available for reload', 'info');
        return;
    }

    eligible.forEach(annotation => {
        annotation.tagging_status = 'processing';
        annotation.review_status = 'processing';
    });
    renderAnnotations();
    renderTimeline();

    try {
        showLoading('Reloading tagging and AI reviews...');

        const requests = eligible.map(async annotation => {
            const [tagResponse, reviewResponse] = await Promise.all([
                fetch(`/api/annotations/${annotation.id}/tags`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                }),
                fetch(`/api/annotations/${annotation.id}/review`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
            ]);

            return {
                annotationId: annotation.id,
                tagOk: tagResponse.ok,
                reviewOk: reviewResponse.ok
            };
        });

        const results = await Promise.allSettled(requests);
        let failures = 0;

        results.forEach(result => {
            if (result.status === 'fulfilled') {
                if (!result.value.tagOk) failures += 1;
                if (!result.value.reviewOk) failures += 1;
            } else {
                failures += 2;
            }
        });

        const summary = failures > 0
            ? `Triggered ${eligible.length} reloads with ${failures} failures${skipped ? ` (${skipped} skipped)` : ''}`
            : `Reloaded ${eligible.length} annotations${skipped ? ` (${skipped} skipped)` : ''}`;

        showToast('Reload all', summary, failures > 0 ? 'warning' : 'success');
    } catch (error) {
        console.error('Error reloading all analyses:', error);
        showToast('Error', 'Failed to reload all analyses', 'error');
    } finally {
        hideLoading();
    }
}

async function triggerTagging(annotationId) {
    try {
        console.error('[TAGGING UI] Relancer Tags clicked', annotationId);
        showLoading('Relaunching tagging process...');
        
        console.error('[TAGGING UI] Sending request to /api/annotations/' + annotationId + '/tags');
        const response = await fetch(`/api/annotations/${annotationId}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to trigger tagging');
        }

        console.error('[TAGGING UI] Tagging request accepted', annotationId);

        showToast('Tagging', 'Tagging process restarted', 'info');
        
    } catch (error) {
        console.error('Error triggering tagging:', error);
        showToast('Error', error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function triggerReview(annotationId) {
    try {
        showLoading('Triggering AI review...');
        
        const response = await fetch(`/api/annotations/${annotationId}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to trigger review');
        }

        showToast('AI Review', 'Review started', 'info');
        
    } catch (error) {
        console.error('Error triggering review:', error);
        showToast('Error', error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function editElicitation(annotationId) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (!annotation) return;
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'editElicitationModal';
    
    const review = annotation.review_results 
        ? (typeof annotation.review_results === 'string' ? JSON.parse(annotation.review_results) : annotation.review_results)
        : null;
    
    const priorityPromptsHTML = review && review.priority_prompts 
        ? `<div class="priority-prompts">
            <strong>Points à adresser en priorité:</strong>
            <ul>
                ${review.priority_prompts.map(p => `<li>${p}</li>`).join('')}
            </ul>
        </div>`
        : '';
    
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="closeEditElicitationModal()">&times;</span>
            <h2>Modifier l'élicitation</h2>
            ${priorityPromptsHTML}
            <textarea id="elicitationTextEdit" rows="10">${annotation.transcription || ''}</textarea>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="saveElicitationEdit(${annotationId})">
                    <i class="fa-solid fa-save"></i>
                    Enregistrer et re-analyser
                </button>
                <button class="btn cancel-btn" onclick="closeEditElicitationModal()">Annuler</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    // Focus on textarea
    document.getElementById('elicitationTextEdit').focus();
}

function closeEditElicitationModal() {
    const modal = document.getElementById('editElicitationModal');
    if (modal) {
        modal.remove();
    }
}

async function saveElicitationEdit(annotationId) {
    const textarea = document.getElementById('elicitationTextEdit');
    const newTranscription = textarea.value.trim();
    
    if (!newTranscription) {
        showToast('Error', 'Transcription cannot be empty', 'error');
        return;
    }
    
    try {
        showLoading('Saving and re-analyzing...');
        
        // Update transcription
        const updateResponse = await fetch(`/api/annotations/${annotationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcription: newTranscription })
        });
        
        if (!updateResponse.ok) {
            throw new Error('Failed to update transcription');
        }
        
        // Trigger re-review
        const reviewResponse = await fetch(`/api/annotations/${annotationId}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!reviewResponse.ok) {
            throw new Error('Failed to trigger re-review');
        }
        
        closeEditElicitationModal();
        showToast('Success', 'Élicitation mise à jour, re-analyse en cours', 'success');
        
        // Reload annotations to show updated content
        if (state.currentVideoId) {
            await loadAnnotations(state.currentVideoId);
        }
        
    } catch (error) {
        console.error('Error saving elicitation:', error);
        showToast('Error', error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function markElicitationComplete(annotationId) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (!annotation) return;
    
    // Update review status to 'skipped' to indicate manual completion
    try {
        const response = await fetch(`/api/annotations/${annotationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ review_status: 'skipped' })
        });
        
        if (!response.ok) {
            throw new Error('Failed to mark as complete');
        }
        
        showToast('Success', 'Élicitation marquée comme complète', 'success');
        
        if (state.currentVideoId) {
            await loadAnnotations(state.currentVideoId);
        }
        
    } catch (error) {
        console.error('Error marking complete:', error);
        showToast('Error', error.message, 'error');
    }
}

function updateReviewStatus(annotationId, status) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.review_status = status;
        if (state.currentVideoId) {
            renderAnnotations();
            renderTimeline();
        }
    }
}

function updateReviewResults(annotationId, reviewResults, isSalient = null) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.review_status = 'completed';
        annotation.review_results = reviewResults;
        if (isSalient !== null && typeof isSalient !== 'undefined') {
            annotation.is_salient = isSalient;
        }
        if (state.currentVideoId) {
            renderAnnotations();
            renderTimeline();
        }
    }
}

function cancelTranscriptionEdit(itemElement, transcriptionDiv, originalText) {
    // Remove editor if exists
    const editor = itemElement.querySelector('.transcription-editor');
    if (editor) editor.remove();
    transcriptionDiv.style.display = '';
}

// Export Annotations
async function exportAnnotations() {
    if (!state.currentVideoId) {
        showToast('Error', 'No video loaded', 'error');
        return;
    }

    try {
        showLoading('Exporting annotations...');

        const response = await fetch(`${API_BASE}/api/export/${state.currentVideoId}`);
        if (!response.ok) throw new Error('Export failed');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `annotations_${state.currentVideo.filename}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showToast('Export Complete', 'Annotations downloaded successfully', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Error', 'Failed to export annotations', 'error');
    } finally {
        hideLoading();
    }
}

// Sorting Functions
function toggleSortDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('sortDropdownMenu');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

function handleSortChange(event) {
    const sortOption = event.currentTarget.dataset.sort;
    state.sortBy = sortOption;

    // Update active state in UI
    document.querySelectorAll('.sort-option').forEach(option => {
        option.classList.remove('active');
    });
    event.currentTarget.classList.add('active');

    // Close dropdown
    document.getElementById('sortDropdownMenu').style.display = 'none';

    // Re-render annotations with new sort
    renderAnnotations();
}

function getSortedAnnotations() {
    const annotations = [...state.annotations]; // Create a copy to avoid mutating state

    switch (state.sortBy) {
        case 'timely-asc':
            // Sort by start_time ascending (earliest first)
            return annotations.sort((a, b) => {
                const A = Number(a.start_time || 0);
                const B = Number(b.start_time || 0);
                return A - B;
            });

        case 'timely-desc':
            // Sort by start_time descending (latest first)
            return annotations.sort((a, b) => {
                const A = Number(a.start_time || 0);
                const B = Number(b.start_time || 0);
                return B - A;
            });

        case 'newest':
        default:
            // Sort by updated_at descending (most recently updated first)
            return annotations.sort((a, b) => {
                const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
                const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
                return dateB - dateA;
            });
    }
}

// Utility Functions
function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';

    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function getStatusText(status) {
    const statusMap = {
        'pending': '<i class="fas fa-hourglass-half"></i> Transcription pending...',
        'processing': '<i class="fas fa-spinner fa-spin"></i> Transcribing audio...',
        'completed': '<i class="fas fa-check-circle"></i> Transcription complete',
        'failed': '<i class="fas fa-exclamation-circle"></i> Transcription failed'
    };

    return statusMap[status] || status;
}

function updateTaggingStatus(annotationId, status) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.tagging_status = status;
        renderAnnotations();
    }
}

function updateTags(annotationId, tags) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.tags = tags;
        annotation.tagging_status = 'completed';
        renderAnnotations();
    }
}

function updateJudgeStatus(annotationId, status) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.judge_status = status;
        renderAnnotations();
    }
}

function updateJudgeDecision(annotationId, judge_decision) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.judge_decision = judge_decision;
        annotation.judge_status = 'completed';
        
        // If judge says review NOT needed and confidence is high, show manual trigger button with hint
        // Otherwise, the auto-review will have been triggered by process_judge in backend
        renderAnnotations();
    }
}

async function triggerManualReview(annotationId, event) {
    event.stopPropagation();
    
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (!annotation) return;
    
    try {
        annotation.review_status = 'processing';
        renderAnnotations();
        
        const response = await fetch(`/api/annotations/${annotationId}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        showToast('AI Review', 'Analysis in progress...', 'info');
    } catch (error) {
        showToast('Error', `Failed to trigger review: ${error.message}`, 'error');
        annotation.review_status = 'failed';
        renderAnnotations();
    }
}

function handleFeedback(annotationId, feedbackValue, event) {
    event.stopPropagation();

    const annotation = state.annotations.find(a => a.id === annotationId);
    if (!annotation) return;

    // If clicking the same feedback, deselect it
    if (annotation.feedback === feedbackValue) {
        annotation.feedback = null;
        renderAnnotations();
        return;
    }

    // Show feedback modal
    showFeedbackModal(annotationId, feedbackValue);
}

function showFeedbackModal(annotationId, feedbackValue) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('feedbackModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'feedbackModal';
        modal.className = 'feedback-modal';
        document.body.appendChild(modal);
    }

    const isPositive = feedbackValue === 1;
    const choices = isPositive ? [
        "Les erreurs communes sont pertinentes",
        "La spécificité du mouvement (pourquoi le faire) est correctement décrite",
        "La description générale du geste est précise (quelle main utiliser, position des jambes...)",
        "La description fine du geste est précise (rotation dans les mains, force dans les jambes...)",
        "Tous les outils mentionnés sont corrects et font partie de la séquence visionnée"
    ] : [
        "Les erreurs communes ne sont pas pertinentes",
        "La spécificité du mouvement (pourquoi le faire) n'est pas correctement décrite",
        "La description générale du geste n'est pas précise (quelle main utiliser, position des jambes...)",
        "La description fine du geste n'est pas précise (rotation dans les mains, force dans les jambes...)",
        "Les outils mentionnés ne sont pas corrects ou ne font pas partie de la séquence visionnée",
        "Cette version décrit au delà du transcript / Ne décrit pas assez le transcript"
    ];

    const choicesHTML = choices.map((choice, index) => `
        <div class="feedback-choice">
            <input type="checkbox" id="choice-${index}" name="feedback-choice" value="${index}">
            <label for="choice-${index}">${choice}</label>
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="feedback-modal-content">
            <div class="feedback-modal-header">
                <h3>Merci pour votre avis</h3>
                <button class="feedback-modal-close">&times;</button>
            </div>
            <div class="feedback-modal-body">
                <p class="feedback-intro">Veuillez sélectionner ce qui vous a ${isPositive ? 'plu' : 'déplu'} :</p>
                <div class="feedback-choices">
                    ${choicesHTML}
                </div>
            </div>
            <div class="feedback-modal-footer">
                <button class="btn btn-secondary" onclick="closeFeedbackModal()">Annuler</button>
                <button class="btn btn-primary" onclick="submitFeedbackModal(${annotationId}, ${feedbackValue})">Soumettre</button>
            </div>
        </div>
    `;

    modal.classList.add('active');

    // Close button handler
    modal.querySelector('.feedback-modal-close').addEventListener('click', closeFeedbackModal);

    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeFeedbackModal();
        }
    });

    // Add change handler for checkboxes to add selected class
    modal.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const choiceDiv = e.target.closest('.feedback-choice');
            if (e.target.checked) {
                choiceDiv.classList.add('selected');
            } else {
                choiceDiv.classList.remove('selected');
            }
        });
    });
}

function closeFeedbackModal() {
    const modal = document.getElementById('feedbackModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

async function submitFeedbackModal(annotationId, feedbackValue) {
    const modal = document.getElementById('feedbackModal');
    const checkboxes = modal.querySelectorAll('input[type="checkbox"]');

    // Get selected choices
    const feedbackChoices = Array.from(checkboxes).map(cb => cb.checked ? 1 : 0);

    try {
        const response = await fetch(`${API_BASE}/api/annotations/${annotationId}/feedback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                annotation_id: annotationId,
                feedback: feedbackValue,
                feedback_choices: feedbackChoices
            })
        });

        if (!response.ok) throw new Error('Failed to submit feedback');

        // Update local state
        const annotation = state.annotations.find(a => a.id === annotationId);
        if (annotation) {
            annotation.feedback = feedbackValue;
            annotation.feedback_choices = JSON.stringify(feedbackChoices);
        }

        renderAnnotations();
        closeFeedbackModal();
        showToast('Feedback Submitted', 'Merci pour votre retour !', 'success');

    } catch (error) {
        console.error('Error submitting feedback:', error);
        showToast('Error', 'Failed to submit feedback', 'error');
    }
}

async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// UI Helper Functions
function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    const messageEl = document.getElementById('loadingMessage');
    messageEl.textContent = message;
    overlay.style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function showToast(title, message, type = 'info') {
    const container = document.getElementById('toastContainer');

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '<i class="fas fa-check-circle"></i>',
        error: '<i class="fas fa-times-circle"></i>',
        warning: '<i class="fas fa-exclamation-triangle"></i>',
        info: '<i class="fas fa-info-circle"></i>'
    };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" title="Close">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(toast);

    // Close button handler
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        removeToast(toast);
    });

    // Auto remove after 4.25 seconds (15% reduction from 5000ms)
    const autoRemoveTimeout = setTimeout(() => {
        removeToast(toast);
    }, 4250);

    // Store timeout ID so we can cancel it if user closes manually
    toast.dataset.timeoutId = autoRemoveTimeout;
}

function removeToast(toast) {
    // Cancel auto-remove timeout if it exists
    if (toast.dataset.timeoutId) {
        clearTimeout(parseInt(toast.dataset.timeoutId));
    }

    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

// ============================================================================
// PROJECTS & TAB MANAGEMENT
// ============================================================================

function switchTab(tabName) {
    state.currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Show/hide content
    const annotateTab = document.getElementById('annotateTab');
    const segmentTab = document.getElementById('segmentTab');
    const projectsTab = document.getElementById('projectsTab');

    // Hide all tabs first (with null checks)
    if (annotateTab) annotateTab.style.display = 'none';
    if (segmentTab) segmentTab.style.display = 'none';
    if (projectsTab) projectsTab.style.display = 'none';

    if (tabName === 'annotate') {
        if (annotateTab) annotateTab.style.display = '';
    } else if (tabName === 'segment') {
        if (segmentTab) segmentTab.style.display = '';
        initializeSegmentTab();
    } else if (tabName === 'projects') {
        if (projectsTab) projectsTab.style.display = 'block';
        loadProjects();
    }
}

async function loadProjects() {
    try {
        const response = await fetch(`${API_BASE}/api/projects`);
        if (!response.ok) throw new Error('Failed to load projects');

        state.projects = await response.json();
        renderProjects();
    } catch (error) {
        console.error('Error loading projects:', error);
        showToast('Error', 'Failed to load projects', 'error');
    }
}

function renderProjects() {
    const grid = document.getElementById('projectsGrid');

    if (state.projects.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-tree empty-icon"></i>
                <h3>No Projects Yet</h3>
                <p>Create a project to organize your videos for batch annotation</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = state.projects.map(project => `
        <div class="project-card" onclick="openProject(${project.id})">
            <div class="project-card-header">
                <div>
                    <div class="project-card-title">${escapeHtml(project.name)}</div>
                </div>
                <div class="project-card-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-icon" onclick="editProject(${project.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-icon" onclick="assignVideos(${project.id})" title="Assign Videos">
                        <i class="fas fa-video"></i>
                    </button>
                    <button class="btn btn-icon btn-danger" onclick="deleteProject(${project.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            ${project.description ? `<div class="project-card-description">${escapeHtml(project.description)}</div>` : ''}
            <div class="project-card-stats">
                <div class="project-stat">
                    <i class="fas fa-video"></i>
                    <span><span class="project-stat-value">${project.video_count || 0}</span> videos</span>
                </div>
                <div class="project-stat">
                    <i class="fas fa-clock"></i>
                    <span>${formatDate(project.created_at)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function openProjectModal(projectId = null) {
    const modal = document.getElementById('projectModal');
    const title = document.getElementById('projectModalTitle');
    const form = document.getElementById('projectForm');
    const nameInput = document.getElementById('projectName');
    const descInput = document.getElementById('projectDescription');

    if (projectId) {
        // Edit mode
        const project = state.projects.find(p => p.id === projectId);
        if (!project) return;

        state.editingProjectId = projectId;
        title.textContent = 'Edit Project';
        nameInput.value = project.name;
        descInput.value = project.description || '';
    } else {
        // Create mode
        state.editingProjectId = null;
        title.textContent = 'Create Project';
        form.reset();
    }

    modal.style.display = 'flex';
}

function closeProjectModal() {
    const modal = document.getElementById('projectModal');
    modal.style.display = 'none';
    state.editingProjectId = null;
}

async function handleProjectFormSubmit(event) {
    event.preventDefault();

    const name = document.getElementById('projectName').value.trim();
    const description = document.getElementById('projectDescription').value.trim();

    if (!name) {
        showToast('Error', 'Project name is required', 'error');
        return;
    }

    try {
        const payload = { name, description };
        let response;

        if (state.editingProjectId) {
            // Update existing project
            response = await fetch(`${API_BASE}/api/projects/${state.editingProjectId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            // Create new project
            response = await fetch(`${API_BASE}/api/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (!response.ok) throw new Error('Failed to save project');

        showToast('Success', `Project ${state.editingProjectId ? 'updated' : 'created'} successfully`, 'success');
        closeProjectModal();
        await loadProjects();

    } catch (error) {
        console.error('Error saving project:', error);
        showToast('Error', 'Failed to save project', 'error');
    }
}

async function editProject(projectId) {
    openProjectModal(projectId);
}

async function deleteProject(projectId) {
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;

    if (!confirm(`Delete project "${project.name}"?\n\nVideos will not be deleted, but will be unassigned from this project.`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/projects/${projectId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete project');

        showToast('Success', 'Project deleted successfully', 'success');
        await loadProjects();

    } catch (error) {
        console.error('Error deleting project:', error);
        showToast('Error', 'Failed to delete project', 'error');
    }
}

async function deleteVideo(videoId) {
    const video = state.videos.find(v => v.id === videoId);
    const name = video ? video.filename : `ID ${videoId}`;

    if (!confirm(`Delete video "${name}" and ALL its elicitations?\n\nThis will remove the video file and all associated annotations. Continue?`)) {
        return;
    }

    try {
        showLoading('Deleting video...');

        const response = await fetch(`${API_BASE}/api/videos/${videoId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(errText || 'Failed to delete video');
        }

        // Remove from local state
        state.videos = state.videos.filter(v => v.id !== videoId);

        // If the deleted video is currently loaded, clear the player
        if (state.currentVideoId === videoId) {
            state.currentVideo = null;
            state.currentVideoId = null;
            // Clear persisted video state
            try {
                localStorage.removeItem('currentVideoId');
            } catch (e) {
                console.error('Failed to clear video state:', e);
            }
            document.getElementById('videoPlayerContainer').style.display = 'none';
            document.getElementById('recordingControls').style.display = 'none';
            document.getElementById('videoSelector').style.display = 'flex';
            document.getElementById('videoInfo').style.display = 'none';
        }

        // Refresh videos in case of ordering or counts
        await loadVideos();

        showToast('Deleted', 'Video and its elicitations were deleted', 'success');
    } catch (error) {
        console.error('Error deleting video:', error);
        showToast('Error', 'Failed to delete video', 'error');
    } finally {
        hideLoading();
        closeVideoModal();
    }
}

async function assignVideos(projectId) {
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;

    const modal = document.getElementById('assignVideosModal');
    document.getElementById('assignProjectName').textContent = project.name;

    // Load videos for this project and all available videos
    try {
        const [projectVideosResp, allVideosResp] = await Promise.all([
            fetch(`${API_BASE}/api/projects/${projectId}/videos`),
            fetch(`${API_BASE}/api/videos`)
        ]);

        if (!projectVideosResp.ok || !allVideosResp.ok) {
            throw new Error('Failed to load videos');
        }

        const projectVideos = await projectVideosResp.json();
        const allVideos = await allVideosResp.json();

        // Separate available (unassigned) and assigned videos
        const assignedIds = new Set(projectVideos.map(v => v.id));
        const availableVideos = allVideos.filter(v => !assignedIds.has(v.id) && !v.project_id);

        // Render available videos
        const availableList = document.getElementById('availableVideosList');
        if (availableVideos.length === 0) {
            availableList.innerHTML = '<div class="empty-state"><p>No available videos</p></div>';
        } else {
            availableList.innerHTML = availableVideos.map(video => `
                <div class="video-item" onclick="addVideoToProject(${projectId}, ${video.id})">
                    <div class="video-item-info">
                        <div class="video-item-name">${escapeHtml(video.filename)}</div>
                        <div class="video-item-meta">No annotations</div>
                    </div>
                    <button class="btn btn-small btn-primary" onclick="event.stopPropagation(); addVideoToProject(${projectId}, ${video.id})">
                        <i class="fas fa-plus"></i> Add
                    </button>
                </div>
            `).join('');
        }

        // Render assigned videos
        const assignedList = document.getElementById('assignedVideosList');
        if (projectVideos.length === 0) {
            assignedList.innerHTML = '<div class="empty-state"><p>No videos assigned yet</p></div>';
        } else {
            assignedList.innerHTML = projectVideos.map((video, index) => `
                <div class="video-item assigned">
                    <div class="video-item-info">
                        <div class="video-item-name">${escapeHtml(video.filename)}</div>
                        <div class="video-item-meta">${video.annotation_count || 0} annotations</div>
                    </div>
                    <div class="video-item-position">
                        <span class="badge">#${index + 1}</span>
                        <button class="btn btn-small btn-danger" onclick="removeVideoFromProject(${video.id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }

        modal.style.display = 'flex';

    } catch (error) {
        console.error('Error loading videos for assignment:', error);
        showToast('Error', 'Failed to load videos', 'error');
    }
}

async function addVideoToProject(projectId, videoId) {
    try {
        // Get current project videos to determine next batch position
        const response = await fetch(`${API_BASE}/api/projects/${projectId}/videos`);
        if (!response.ok) throw new Error('Failed to load project videos');

        const projectVideos = await response.json();
        const nextPosition = projectVideos.length + 1;

        // Update video with project_id and batch_position
        const updateResp = await fetch(`${API_BASE}/api/videos/${videoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
                batch_position: nextPosition
            })
        });

        if (!updateResp.ok) throw new Error('Failed to assign video');

        showToast('Success', 'Video added to project', 'success');

        // Refresh the assign videos modal
        closeAssignVideosModal();
        await assignVideos(projectId);

    } catch (error) {
        console.error('Error adding video to project:', error);
        showToast('Error', 'Failed to add video to project', 'error');
    }
}

async function removeVideoFromProject(videoId) {
    try {
        // Remove project_id and batch_position from video
        const response = await fetch(`${API_BASE}/api/videos/${videoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: null,
                batch_position: null
            })
        });

        if (!response.ok) throw new Error('Failed to remove video');

        showToast('Success', 'Video removed from project', 'success');

        // Refresh - close and reopen modal
        const modal = document.getElementById('assignVideosModal');
        const projectName = document.getElementById('assignProjectName').textContent;
        const project = state.projects.find(p => p.name === projectName);

        if (project) {
            closeAssignVideosModal();
            await assignVideos(project.id);
        }

    } catch (error) {
        console.error('Error removing video from project:', error);
        showToast('Error', 'Failed to remove video from project', 'error');
    }
}

function closeAssignVideosModal() {
    const modal = document.getElementById('assignVideosModal');
    modal.style.display = 'none';
}

async function openProject(projectId) {
    try {
        const response = await fetch(`${API_BASE}/api/projects/${projectId}/videos`);
        if (!response.ok) throw new Error('Failed to load project videos');

        const videos = await response.json();

        if (videos.length === 0) {
            showToast('Info', 'No videos in this project yet', 'info');
            return;
        }

        // Switch to annotate tab and load first video
        state.currentProject = projectId;
        switchTab('annotate');

        // Load the first video
        await selectVideo(videos[0].id);

        showToast('Success', `Loaded project with ${videos.length} video(s)`, 'success');

    } catch (error) {
        console.error('Error opening project:', error);
        showToast('Error', 'Failed to open project', 'error');
    }
}

// Utility functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
}

// ============================================================================
// LOCAL FOLDER BROWSER
// ============================================================================

function openLocalFolderModal() {
    console.log('openLocalFolderModal called!');
    const modal = document.getElementById('localFolderModal');
    console.log('Modal element:', modal);
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('localVideosContainer').style.display = 'none';
        document.getElementById('localFolderPath').value = '';

        // Focus on the input field
        setTimeout(() => {
            document.getElementById('localFolderPath').focus();
        }, 100);

        // Close on Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                closeLocalFolderModal();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);

        // Close on background click
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeLocalFolderModal();
            }
        };
    } else {
        console.error('localFolderModal not found!');
    }
}

function closeLocalFolderModal() {
    document.getElementById('localFolderModal').style.display = 'none';
}

async function handleBrowseLocalFolder() {
    const folderPath = document.getElementById('localFolderPath').value.trim();

    if (!folderPath) {
        showToast('Error', 'Please enter a folder path', 'error');
        return;
    }

    // Call the existing handleBrowseFolder function and close modal on success
    await handleBrowseFolder(folderPath);
    closeLocalFolderModal();
}

function renderLocalVideos(videos) {
    const container = document.getElementById('localVideosList');

    container.innerHTML = videos.map((video, index) => `
        <div class="local-video-item" data-video-index="${index}">
            <div class="local-video-info">
                <div class="local-video-name">
                    <i class="fas fa-video"></i>
                    ${escapeHtml(video.filename)}
                </div>
                <div class="local-video-meta">
                    <span class="local-video-size">${video.file_size_mb} MB</span>
                    <span class="local-video-path">${escapeHtml(video.filepath)}</span>
                </div>
            </div>
            <button class="btn btn-primary btn-small local-video-add-btn" data-video-index="${index}">
                <i class="fas fa-plus"></i> Add
            </button>
        </div>
    `).join('');

    // Store videos data for later access
    window.localVideosData = videos;

    // Add event listeners to buttons
    document.querySelectorAll('.local-video-add-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.getAttribute('data-video-index'));
            const video = window.localVideosData[index];
            registerLocalVideo(video.filepath, video.filename);
        });
    });
}

async function registerLocalVideo(filepath, filename) {
    console.log('Registering local video:', { filepath, filename });

    const response = await fetch(`${API_BASE}/api/videos/local/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filepath })
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Registration failed:', error);

        // Check if it's a duplicate error
        if (error.detail && error.detail.includes('UNIQUE constraint failed')) {
            // Don't show error, just return null to indicate duplicate
            return null;
        }

        throw new Error(error.detail || 'Failed to register video');
    }

    const video = await response.json();
    console.log('Video registered successfully:', video.id);

    return video;
}

// Make functions globally available
window.seekToAnnotation = seekToAnnotation;
window.deleteAnnotation = deleteAnnotation;
window.toggleDimension = toggleDimension;
window.triggerReview = triggerReview;
window.editElicitation = editElicitation;
window.closeEditElicitationModal = closeEditElicitationModal;

// ============================================================================
// SEGMENTATION TAB FUNCTIONS
// ============================================================================

function initializeSegmentTab() {
    // Initialize event listeners for segmentation controls
    const trimStartInput = document.getElementById('trimStartInput');
    const trimEndInput = document.getElementById('trimEndInput');
    const createSegmentBtn = document.getElementById('createSegmentBtn');
    const clearSegmentBtn = document.getElementById('clearSegmentBtn');
    const refreshSegmentsBtn = document.getElementById('refreshSegmentsBtn');
    const segmentVideoPlayer = document.getElementById('segmentVideoPlayer');
    const timelineTrack = document.querySelector('.timeline-track');
    const trimHandleStart = document.getElementById('trimHandleStart');
    const trimHandleEnd = document.getElementById('trimHandleEnd');

    if (trimStartInput && !trimStartInput.dataset.initialized) {
        trimStartInput.addEventListener('input', handleTimeInputChange);
        trimStartInput.addEventListener('blur', validateTimeInput);
        trimStartInput.dataset.initialized = 'true';
    }

    if (trimEndInput && !trimEndInput.dataset.initialized) {
        trimEndInput.addEventListener('input', handleTimeInputChange);
        trimEndInput.addEventListener('blur', validateTimeInput);
        trimEndInput.dataset.initialized = 'true';
    }

    if (createSegmentBtn && !createSegmentBtn.dataset.initialized) {
        createSegmentBtn.addEventListener('click', createSegment);
        createSegmentBtn.dataset.initialized = 'true';
    }

    if (clearSegmentBtn && !clearSegmentBtn.dataset.initialized) {
        clearSegmentBtn.addEventListener('click', clearSegmentMarkers);
        clearSegmentBtn.dataset.initialized = 'true';
    }

    if (refreshSegmentsBtn && !refreshSegmentsBtn.dataset.initialized) {
        refreshSegmentsBtn.addEventListener('click', () => {
            if (state.segmentVideoId) {
                loadSegments(state.segmentVideoId);
            }
        });
        refreshSegmentsBtn.dataset.initialized = 'true';
    }

    // Timeline click to set position
    if (timelineTrack && !timelineTrack.dataset.initialized) {
        timelineTrack.addEventListener('click', handleTimelineClick);
        timelineTrack.dataset.initialized = 'true';
    }

    // Draggable handles
    if (trimHandleStart && !trimHandleStart.dataset.initialized) {
        trimHandleStart.addEventListener('mousedown', (e) => startDrag(e, 'start'));
        trimHandleStart.dataset.initialized = 'true';
    }

    if (trimHandleEnd && !trimHandleEnd.dataset.initialized) {
        trimHandleEnd.addEventListener('mousedown', (e) => startDrag(e, 'end'));
        trimHandleEnd.dataset.initialized = 'true';
    }

    // Update playhead position
    if (segmentVideoPlayer && !segmentVideoPlayer.dataset.playheadInitialized) {
        segmentVideoPlayer.addEventListener('timeupdate', updatePlayhead);
        segmentVideoPlayer.dataset.playheadInitialized = 'true';
    }

    // If a video is already loaded in the elicitation tab, use it
    if (state.currentVideoId && state.currentVideo) {
        loadVideoForSegmentation(state.currentVideoId);
    }
}

// Drag state
let isDragging = false;
let dragType = null;

function startDrag(e, type) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    dragType = type;
    
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', stopDrag);
}

function handleDrag(e) {
    if (!isDragging) return;
    
    const timelineTrack = document.querySelector('.timeline-track');
    const rect = timelineTrack.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    
    const player = document.getElementById('segmentVideoPlayer');
    if (!player || !player.duration) return;
    
    const time = percentage * player.duration;
    
    if (dragType === 'start') {
        state.segmentStartTime = time;
        if (state.segmentEndTime !== null && time >= state.segmentEndTime) {
            state.segmentEndTime = Math.min(time + 1, player.duration);
        }
    } else if (dragType === 'end') {
        state.segmentEndTime = time;
        if (state.segmentStartTime !== null && time <= state.segmentStartTime) {
            state.segmentStartTime = Math.max(0, time - 1);
        }
    }
    
    updateTimelineUI();
}

function stopDrag() {
    isDragging = false;
    dragType = null;
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', stopDrag);
}

function handleTimelineClick(e) {
    if (isDragging) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    
    const player = document.getElementById('segmentVideoPlayer');
    if (!player || !player.duration) return;
    
    const time = percentage * player.duration;
    
    // Set start if not set, otherwise set end
    if (state.segmentStartTime === null) {
        state.segmentStartTime = time;
    } else if (state.segmentEndTime === null || time > state.segmentStartTime) {
        state.segmentEndTime = time;
    } else {
        state.segmentStartTime = time;
    }
    
    updateTimelineUI();
}

function handleTimeInputChange(e) {
    const input = e.target;
    const value = input.value;
    
    // Only allow digits and colon
    const cleaned = value.replace(/[^0-9:]/g, '');
    if (cleaned !== value) {
        input.value = cleaned;
        return;
    }
    
    // Try to parse if it looks complete
    if (value.match(/^\d{1,2}:\d{2}$/)) {
        const time = parseTimeInput(value);
        if (time !== null) {
            if (input.id === 'trimStartInput') {
                state.segmentStartTime = time;
            } else {
                state.segmentEndTime = time;
            }
            updateTimelineUI();
        }
    }
}

function validateTimeInput(e) {
    const input = e.target;
    const value = input.value;
    
    if (!value) return;
    
    const time = parseTimeInput(value);
    if (time !== null) {
        if (input.id === 'trimStartInput') {
            state.segmentStartTime = time;
        } else {
            state.segmentEndTime = time;
        }
    }
    
    updateTimelineUI();
}

function parseTimeInput(timeStr) {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    
    if (seconds >= 60) return null;
    
    const player = document.getElementById('segmentVideoPlayer');
    const time = minutes * 60 + seconds;
    
    if (player && player.duration && time > player.duration) {
        return player.duration;
    }
    
    return time;
}

function updatePlayhead() {
    const player = document.getElementById('segmentVideoPlayer');
    const playhead = document.getElementById('timelinePlayhead');
    
    if (!player || !player.duration || !playhead) return;
    
    const percentage = (player.currentTime / player.duration) * 100;
    playhead.style.left = percentage + '%';
}

function updateTimelineUI() {
    const player = document.getElementById('segmentVideoPlayer');
    if (!player || !player.duration) return;
    
    const startTime = state.segmentStartTime !== null ? state.segmentStartTime : 0;
    const endTime = state.segmentEndTime !== null ? state.segmentEndTime : player.duration;
    
    // Update timeline selection
    const selection = document.getElementById('timelineSelection');
    if (selection) {
        const startPercent = (startTime / player.duration) * 100;
        const endPercent = (endTime / player.duration) * 100;
        selection.style.left = startPercent + '%';
        selection.style.width = (endPercent - startPercent) + '%';
    }
    
    // Update input fields
    document.getElementById('trimStartInput').value = formatTimeInput(startTime);
    document.getElementById('trimEndInput').value = formatTimeInput(endTime);
    
    // Update duration display
    const duration = endTime - startTime;
    document.getElementById('trimDuration').textContent = formatTime(duration);
    
    // Enable/disable create button
    const createBtn = document.getElementById('createSegmentBtn');
    if (createBtn) {
        createBtn.disabled = state.segmentStartTime === null || state.segmentEndTime === null || 
                             state.segmentEndTime <= state.segmentStartTime;
    }
}

function formatTimeInput(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function loadVideoForSegmentation(videoId) {
    try {
        const response = await fetch(`${API_BASE}/api/videos/${videoId}`);
        if (!response.ok) throw new Error('Failed to load video');

        const video = await response.json();
        state.segmentVideoId = videoId;

        // Show video player
        document.getElementById('segmentVideoSelector').style.display = 'none';
        document.getElementById('segmentVideoPlayerContainer').style.display = 'block';
        document.getElementById('segmentationControls').style.display = 'flex';
        document.getElementById('segmentVideoInfo').style.display = 'flex';

        // Load video
        const videoPlayer = document.getElementById('segmentVideoPlayer');
        const videoSource = document.getElementById('segmentVideoSource');
        videoSource.src = `${API_BASE}/api/videos/${videoId}/file`;
        videoPlayer.load();

        state.segmentVideoElement = videoPlayer;

        // Initialize timeline when video metadata is loaded
        videoPlayer.addEventListener('loadedmetadata', function initTimeline() {
            // Set default segment to full video
            state.segmentStartTime = 0;
            state.segmentEndTime = videoPlayer.duration;
            updateTimelineUI();
        }, { once: true });

        // Update info
        document.getElementById('segmentVideoName').textContent = video.filename;

        // Load existing segments
        await loadSegments(videoId);

    } catch (error) {
        console.error('Error loading video for segmentation:', error);
        showToast('Error', 'Failed to load video', 'error');
    }
}

function clearSegmentMarkers() {
    const player = document.getElementById('segmentVideoPlayer');
    
    // Reset to full video range if video is loaded
    if (player && player.duration) {
        state.segmentStartTime = 0;
        state.segmentEndTime = player.duration;
        updateTimelineUI();
    } else {
        // No video loaded, just clear
        state.segmentStartTime = null;
        state.segmentEndTime = null;
        document.getElementById('trimStartInput').value = '';
        document.getElementById('trimEndInput').value = '';
        document.getElementById('trimDuration').textContent = '0:00';
        
        // Reset timeline UI to initial state
        const selection = document.getElementById('timelineSelection');
        if (selection) {
            selection.style.left = '0%';
            selection.style.width = '100%';
        }
    }
    
    document.getElementById('segmentNameInput').value = '';
    
    const createBtn = document.getElementById('createSegmentBtn');
    if (createBtn) {
        createBtn.disabled = false; // Enable since full video is valid
    }
}

async function createSegment() {
    if (!state.segmentVideoId) {
        showToast('Error', 'No video loaded', 'error');
        return;
    }

    if (state.segmentStartTime === null || state.segmentEndTime === null) {
        showToast('Error', 'Please set start and end times', 'error');
        return;
    }

    if (state.segmentEndTime <= state.segmentStartTime) {
        showToast('Error', 'End time must be after start time', 'error');
        return;
    }

    try {
        showLoading('Creating segment...');

        const segmentName = document.getElementById('segmentNameInput').value.trim() || null;

        const segmentData = {
            parent_video_id: state.segmentVideoId,
            name: segmentName,
            start_time: state.segmentStartTime,
            end_time: state.segmentEndTime
        };

        const response = await fetch(`${API_BASE}/api/segments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(segmentData)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error || 'Failed to create segment');
        }

        const segment = await response.json();
        showToast('Success', 'Segment created successfully', 'success');

        // Reload segments
        await loadSegments(state.segmentVideoId);

        // Clear form
        clearSegmentMarkers();

    } catch (error) {
        console.error('Error creating segment:', error);
        showToast('Error', error.message || 'Failed to create segment', 'error');
    } finally {
        hideLoading();
    }
}

async function loadSegments(videoId) {
    try {
        const response = await fetch(`${API_BASE}/api/segments/video/${videoId}`);
        if (!response.ok) throw new Error('Failed to load segments');

        state.segments = await response.json();
        renderSegments();

        // Update segment count
        document.getElementById('segmentCount').textContent = state.segments.length;

    } catch (error) {
        console.error('Error loading segments:', error);
        showToast('Error', 'Failed to load segments', 'error');
    }
}

function renderSegments() {
    const container = document.getElementById('segmentsList');

    if (state.segments.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-scissors empty-icon"></i>
                <p>No segments yet</p>
                <p class="hint">Mark start and end times to create your first segment</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    state.segments.forEach(segment => {
        const duration = segment.end_time - segment.start_time;
        const segmentName = segment.name || 'Unnamed Segment';

        const item = document.createElement('div');
        item.className = 'segment-item';
        item.innerHTML = `
            <div class="segment-header">
                <div class="segment-name ${segment.name ? '' : 'unnamed'}">
                    <i class="fas fa-cut"></i> ${segmentName}
                </div>
                <div class="segment-actions-buttons">
                    <button class="btn btn-icon btn-small" onclick="seekToSegment(${segment.id})" title="Play segment">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn btn-icon btn-small" onclick="editSegment(${segment.id})" title="Edit segment">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-icon btn-small" onclick="deleteSegment(${segment.id})" title="Delete segment">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="segment-info">
                <div class="segment-time-range">
                    <i class="fas fa-clock"></i>
                    <span>${formatTime(segment.start_time)} - ${formatTime(segment.end_time)}</span>
                    <span>(${formatTime(duration)})</span>
                </div>
            </div>
        `;

        container.appendChild(item);
    });
}

function seekToSegment(segmentId) {
    const segment = state.segments.find(s => s.id === segmentId);
    if (!segment) return;

    const player = document.getElementById('segmentVideoPlayer');
    if (player) {
        player.currentTime = segment.start_time;
        player.play();
    }
}

async function editSegment(segmentId) {
    const segment = state.segments.find(s => s.id === segmentId);
    if (!segment) return;

    const newName = prompt('Edit segment name:', segment.name || '');
    if (newName === null) return; // User cancelled

    try {
        showLoading('Updating segment...');

        const response = await fetch(`${API_BASE}/api/segments/${segmentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() || null })
        });

        if (!response.ok) throw new Error('Failed to update segment');

        showToast('Success', 'Segment updated', 'success');
        await loadSegments(state.segmentVideoId);

    } catch (error) {
        console.error('Error updating segment:', error);
        showToast('Error', 'Failed to update segment', 'error');
    } finally {
        hideLoading();
    }
}

async function deleteSegment(segmentId) {
    if (!confirm('Delete this segment?')) return;

    try {
        showLoading('Deleting segment...');

        const response = await fetch(`${API_BASE}/api/segments/${segmentId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete segment');

        showToast('Success', 'Segment deleted', 'success');
        await loadSegments(state.segmentVideoId);

    } catch (error) {
        console.error('Error deleting segment:', error);
        showToast('Error', 'Failed to delete segment', 'error');
    } finally {
        hideLoading();
    }
}

// Make segmentation functions globally available
window.seekToSegment = seekToSegment;
window.editSegment = editSegment;
window.deleteSegment = deleteSegment;
window.saveElicitationEdit = saveElicitationEdit;
window.markElicitationComplete = markElicitationComplete;
window.registerLocalVideo = registerLocalVideo;
window.handleFeedback = handleFeedback;
window.openProject = openProject;
window.editProject = editProject;
window.deleteProject = deleteProject;
window.assignVideos = assignVideos;
window.addVideoToProject = addVideoToProject;
window.removeVideoFromProject = removeVideoFromProject;
window.deleteVideo = deleteVideo;
