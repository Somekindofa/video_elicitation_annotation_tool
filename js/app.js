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
    storageMode: 'server',
    // Segment-specific state
    segmentStartTime: null,
    segmentEndTime: null,
    segments: [],
    // Cached list of files found in the user's OwnCloud personal folder (populated on select)
    ownCloudFiles: [],
    // Tracks which annotation review panels are open { [annotationId]: boolean }
    showReviewPanels: {}
};

// API Base URL and JWT token from iframe query
const TOKEN_PARAM = new URLSearchParams(window.location.search).get('token');
const MOODLE_JWT = TOKEN_PARAM || '';

// Decode JWT payload (lightweight) so we can access `userid` for OwnCloud discovery fallbacks
function parseJwtPayload(token) {
    try {
        const payload = token.split('.')[1];
        const json = decodeURIComponent(atob(payload).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(json);
    } catch (e) {
        return null;
    }
}
const _JWT_PAYLOAD = parseJwtPayload(MOODLE_JWT) || {};
window.USER_ID = _JWT_PAYLOAD.userid || _JWT_PAYLOAD.user_id || null;

const APP_BASE_PATH = (() => {
    let path = window.location.pathname || '';
    if (path.endsWith('/index.html')) {
        path = path.slice(0, -'/index.html'.length);
    }
    if (path.endsWith('/')) {
        path = path.slice(0, -1);
    }
    return path;
})();

const API_BASE = window.location.origin + APP_BASE_PATH;

// Inject Authorization header for same-origin API requests
const originalFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    const url = typeof input === 'string' ? input : input.url;
    const isSameOrigin = url.startsWith('/') || url.startsWith(window.location.origin);

    if (MOODLE_JWT && isSameOrigin) {
        headers.set('Authorization', `Bearer ${MOODLE_JWT}`);
    }

    return originalFetch(input, { ...init, headers });
};

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
            <p>Click "Upload to OwnCloud" then "Select Video" to get started</p>
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

async function loadStorageMode() {
    if (!MOODLE_JWT) {
        state.storageMode = 'server';
        // updateTestModeBanner();
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/storage-mode`);
        if (!response.ok) {
            throw new Error(`Storage mode check failed: ${response.status}`);
        }
        const data = await response.json();
        state.storageMode = data.mode === 'webdav' ? 'webdav' : 'server';
    } catch (error) {
        console.warn('Falling back to server storage mode:', error);
        state.storageMode = 'server';
    }

    // updateTestModeBanner();
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

    // Load storage mode and update banner
    await loadStorageMode();

    // Load craft selection from localStorage (default to glassblowing)
    state.craft = localStorage.getItem('craft') || 'glassblowing';
    // Create craft selector UI only (task selector removed)
    createElicitControlsUI();

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

    // Show tutorial automatically for newcomers (non-blocking)
    maybeShowTutorialForNewcomer().catch(() => {});

    // Check for any uploads interrupted by a previous page navigation (non-blocking)
    if (_webdavApiUrl) checkAndOfferResumeUploads().catch(e => console.warn('Resume check:', e));

    console.log('Application initialized successfully');
}

// Create a small craft selector UI under the recording controls
function createElicitControlsUI() {
    try {
        const controls = document.getElementById('recordingControls');
        if (!controls) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'elicit-controls';
        wrapper.style.margin = '10px 0';

        // --- Craft domain selector ---
        const craftLabel = document.createElement('div');
        craftLabel.textContent = 'Select your craft domain';
        craftLabel.style.fontSize = '0.9rem';
        craftLabel.style.marginBottom = '6px';

        const craftSelect = document.createElement('select');
        craftSelect.id = 'craftSelector';
        craftSelect.style.padding = '6px 8px';
        craftSelect.style.borderRadius = '4px';
        craftSelect.style.border = '1px solid #ccc';

        [
            { value: 'glassblowing', label: 'Glassblowing' },
            { value: 'scientific_glassblowing', label: 'Scientific Glassblowing' },
            { value: 'jewelry', label: 'Jewelry' }
        ].forEach(o => {
            const option = document.createElement('option');
            option.value = o.value;
            option.textContent = o.label;
            craftSelect.appendChild(option);
        });

        craftSelect.value = state.craft || 'glassblowing';
        craftSelect.addEventListener('change', (e) => {
            state.craft = e.target.value;
            try { localStorage.setItem('craft', state.craft); } catch (e) { }
        });

        wrapper.appendChild(craftLabel);
        wrapper.appendChild(craftSelect);

        // --- Segment selector ---
        const segWrapper = document.createElement('div');
        segWrapper.id = 'segmentSelectorWrapper';
        segWrapper.style.marginTop = '10px';
        segWrapper.style.display = 'none'; // hidden until segments exist

        const segLabel = document.createElement('div');
        segLabel.textContent = 'Select segment';
        segLabel.style.fontSize = '0.9rem';
        segLabel.style.marginBottom = '6px';

        const segSelect = document.createElement('select');
        segSelect.id = 'segmentSelector';
        segSelect.style.padding = '6px 8px';
        segSelect.style.borderRadius = '4px';
        segSelect.style.border = '1px solid #ccc';

        segSelect.addEventListener('change', (e) => {
            const startTime = parseFloat(e.target.value);
            if (!isNaN(startTime)) {
                const videoPlayer = document.getElementById('videoPlayer');
                if (videoPlayer) {
                    videoPlayer.pause();
                    videoPlayer.currentTime = Math.max(0, startTime);
                }
            }
        });

        segWrapper.appendChild(segLabel);
        segWrapper.appendChild(segSelect);
        wrapper.appendChild(segWrapper);

        // Insert at top of recording controls
        controls.insertBefore(wrapper, controls.firstChild);
    } catch (e) {
        console.error('Failed to create elicit controls UI', e);
    }
}

// Update the segment dropdown in the elicit controls to reflect currently loaded segments.
function refreshSegmentSelector() {
    const wrapper = document.getElementById('segmentSelectorWrapper');
    const segSelect = document.getElementById('segmentSelector');
    if (!wrapper || !segSelect) return;

    const segments = state.segments || [];
    segSelect.innerHTML = '';

    if (segments.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    // Placeholder option
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— choose a segment —';
    placeholder.disabled = true;
    placeholder.selected = true;
    segSelect.appendChild(placeholder);

    segments.forEach(seg => {
        const opt = document.createElement('option');
        opt.value = seg.start_time;
        opt.textContent = seg.name
            ? `${seg.name} (${formatTime(seg.start_time)} → ${formatTime(seg.end_time)})`
            : `${formatTime(seg.start_time)} → ${formatTime(seg.end_time)}`;
        segSelect.appendChild(opt);
    });

    wrapper.style.display = 'block';
}

// Task selector removed — only craft domain selection is shown in the Elicit tab.
// These stubs prevent errors if any legacy code path calls them.
async function initializeTaskSelector() { /* removed */ }

async function loadTasks(selectEl, craft) {
    try {
        const craftQuery = craft ? `&craft=${encodeURIComponent(craft)}` : '';
        const resp = await fetch(`${API_BASE}/api/tasks?published=1${craftQuery}`);
        if (!resp.ok) throw new Error('Failed to fetch tasks');
        const tasks = await resp.json();
        state.tasks = tasks || [];
    } catch (err) {
        console.warn('Failed to fetch tasks', err);
        state.tasks = [];
    }
    if (selectEl) {
        renderTaskOptions(selectEl);
    }
}

function renderTaskOptions(selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- Select a task --';
    selectEl.appendChild(placeholder);
    state.tasks.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.name;
        opt.textContent = t.name;
        selectEl.appendChild(opt);
    });
    // Reselect previous task if present
    if (state.task) {
        selectEl.value = state.task;
    }
}

async function createOrSelectTask(taskName) {
    // If task already in list for this craft, just select it
    const existing = state.tasks.find(t => t.name === taskName && t.craft === state.craft);
    if (existing) {
        state.task = existing.name;
        try { localStorage.setItem('task', state.task); } catch (_) { }
        const selectEl = document.getElementById('taskSelect');
        if (selectEl) {
            selectEl.value = state.task;
        }
        return;
    }

    // Otherwise create and publish for this craft
    const resp = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: taskName, craft: state.craft, description: null, is_published: 1 })
    });
    if (!resp.ok) {
        throw new Error(`Failed to create task: ${resp.status}`);
    }
    const created = await resp.json();
    state.tasks.push(created);
    state.task = created.name;
    try { localStorage.setItem('task', state.task); } catch (_) { }
    const selectEl = document.getElementById('taskSelect');
    if (selectEl) {
        renderTaskOptions(selectEl);
        selectEl.value = created.name;
    }
}

// Event Listeners Setup
function setupEventListeners() {
    console.log('=== Setting up event listeners ===');

    // Video selection
    document.getElementById('selectVideoBtn').addEventListener('click', async () => {
        // Offer resume banners for any uploads interrupted since last page load.
        if (_webdavApiUrl) checkAndOfferResumeUploads().catch(e => console.warn('Resume check:', e));

        // When user opens the video selector, proactively PROPFIND the user's OwnCloud personal folder
        // so the UI can offer remote files without additional browsing steps.
        if (_webdavApiUrl) {
            try {
                showLoading('Scanning OwnCloud user folder...');
                await scanUserOwnCloudFolder();
                hideLoading();
                showToast('OwnCloud', `Found ${state.ownCloudFiles.length} files in your personal folder`, 'success');
            } catch (err) {
                hideLoading();
                console.error('OwnCloud scan failed:', err);
                showToast('OwnCloud', `Scan failed: ${err.message}`, 'error');
            }
        }

        // Open the normal video modal if we have any videos (local or linked) or remote OwnCloud files
        if (state.videos.length > 0 || (state.ownCloudFiles && state.ownCloudFiles.length > 0)) {
            showVideoModal();
        } else {
            showToast('No Videos', 'Please upload videos first', 'info');
        }
    });

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

    // OwnCloud Video Browser
    document.getElementById('linkOwnCloudBtn').addEventListener('click', openOwnCloudModal);
    document.getElementById('closeOwnCloudModalBtn').addEventListener('click', closeOwnCloudModal);
    document.getElementById('closeOwnCloudBtn').addEventListener('click', closeOwnCloudModal);
}

// WebSocket Connection
function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}${APP_BASE_PATH}/ws`;

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

        case 'extended_transcript_status':
            updateExtendedTranscriptStatus(message.annotation_id, message.status);
            break;

        case 'extended_transcript_complete':
            updateExtendedTranscript(message.annotation_id, message.extended_transcript);
            if (state.currentVideoId) {
                loadAnnotations(state.currentVideoId);
            }
            break;

        case 'extended_transcript_error':
            showToast('Extended Transcript Error', message.error, 'error');
            updateExtendedTranscriptStatus(message.annotation_id, 'failed');
            break;

        case 'judge_status':
            updateJudgeStatus(message.annotation_id, message.status);
            break;

        case 'judge_complete':
            updateJudgeDecision(message.annotation_id, message.judge_decision);
            break;

        case 'judge_error':
            updateJudgeStatus(message.annotation_id, 'failed');
            break;

        case 'tagging_status':
            updateTaggingStatus(message.annotation_id, message.status);
            break;

        case 'tagging_complete':
            updateTags(message.annotation_id, message.tags);
            break;

        case 'tagging_error':
            updateTaggingStatus(message.annotation_id, 'failed');
            break;

        case 'task_detection_status':
            updateTaskDetectionStatus(message.annotation_id, message.status);
            break;

        case 'task_detection_complete':
            updateTaskDetected(message.annotation_id, message.detected_task, message.confidence);
            break;

        case 'task_detection_error':
            updateTaskDetectionStatus(message.annotation_id, 'failed');
            break;

        case 'review_status':
            updateReviewStatus(message.annotation_id, message.status);
            break;

        case 'review_complete':
            updateReviewResults(message.annotation_id, message.review_results, message.is_salient);
            break;

        case 'review_error':
            updateReviewStatus(message.annotation_id, 'failed');
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


function ensureUploadPanel() {
    let panel = document.getElementById('uploadProgressPanel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'uploadProgressPanel';
    panel.style.position = 'fixed';
    panel.style.right = '24px';
    panel.style.bottom = '24px';
    panel.style.width = '360px';
    panel.style.maxHeight = '50vh';
    panel.style.overflowY = 'auto';
    panel.style.background = '#ffffff';
    panel.style.border = '1px solid #d5d5d5';
    panel.style.boxShadow = '0 12px 24px rgba(0,0,0,0.12)';
    panel.style.borderRadius = '8px';
    panel.style.padding = '12px 14px';
    panel.style.zIndex = '9999';

    const title = document.createElement('div');
    title.textContent = 'Uploading videos';
    title.style.fontWeight = '600';
    title.style.marginBottom = '8px';
    panel.appendChild(title);

    const list = document.createElement('div');
    list.id = 'uploadProgressList';
    panel.appendChild(list);

    document.body.appendChild(panel);
    return panel;
}

function updateUploadRow(fileName, percent, statusText, isError) {
    const list = document.getElementById('uploadProgressList');
    if (!list) return;

    let row = list.querySelector(`[data-file="${CSS.escape(fileName)}"]`);
    if (!row) {
        row = document.createElement('div');
        row.dataset.file = fileName;
        row.style.marginBottom = '10px';

        const label = document.createElement('div');
        label.className = 'upload-row-label';
        label.textContent = fileName;
        label.style.fontSize = '12px';
        label.style.marginBottom = '4px';
        row.appendChild(label);

        const bar = document.createElement('div');
        bar.className = 'upload-progress-bar';
        bar.style.height = '6px';
        bar.style.background = '#e0e0e0';
        bar.style.borderRadius = '999px';
        bar.style.overflow = 'hidden';

        const fill = document.createElement('div');
        fill.className = 'upload-progress-fill';
        fill.style.height = '100%';
        fill.style.width = '0%';
        fill.style.background = '#2a7ae2';
        bar.appendChild(fill);
        row.appendChild(bar);

        const status = document.createElement('div');
        status.className = 'upload-row-status';
        status.style.fontSize = '11px';
        status.style.marginTop = '3px';
        status.style.color = '#666';
        row.appendChild(status);

        list.appendChild(row);
    }

    const fill = row.querySelector('.upload-progress-fill');
    if (fill) {
        fill.style.width = `${percent}%`;
        fill.style.background = isError ? '#dc3545' : '#2a7ae2';
    }

    const status = row.querySelector('.upload-row-status');
    if (status && statusText !== undefined) {
        status.textContent = statusText;
        status.style.color = isError ? '#dc3545' : '#666';
    }
}

function removeUploadRow(fileName) {
    const list = document.getElementById('uploadProgressList');
    if (!list) return;
    const row = list.querySelector(`[data-file="${CSS.escape(fileName)}"]`);
    if (row) row.remove();
    // Hide the panel if no rows remain
    if (!list.children.length) {
        const panel = document.getElementById('uploadProgressPanel');
        if (panel) panel.remove();
    }
}

async function uploadVideos(files) {
    ensureUploadPanel();

    for (const file of files) {
        await uploadSingleFile(file);
    }

    const panel = document.getElementById('uploadProgressPanel');
    if (panel) {
        setTimeout(() => panel.remove(), 2000);
    }
}

function uploadSingleFile(file) {
    return new Promise((resolve, reject) => {
        const isWebDav = state.storageMode === 'webdav';
        const endpoint = isWebDav ? '/api/uploads' : '/api/videos/upload';
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}${endpoint}`);

        if (MOODLE_JWT) {
            xhr.setRequestHeader('Authorization', `Bearer ${MOODLE_JWT}`);
        }

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                updateUploadRow(file.name, percent);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                updateUploadRow(file.name, 100);
                resolve();
            } else {
                reject(new Error(xhr.responseText || 'Upload failed'));
            }
        };

        xhr.onerror = () => {
            reject(new Error('Upload failed'));
        };

        const formData = new FormData();
        const fieldName = isWebDav ? 'files' : 'file';
        formData.append(fieldName, file, file.name);
        xhr.send(formData);
    });
}

// Load Videos
async function loadVideos() {
    try {
        const response = await fetch(`${API_BASE}/api/videos`);
        if (!response.ok) throw new Error('Failed to load videos');

        state.videos = await response.json();

        // If Segment tab is initialized, update its selector immediately
        if (_segmentTabInitialized) renderSegmentVideoSelector();

    } catch (error) {
        console.error('Error loading videos:', error);
        showToast('Error', 'Failed to load videos', 'error');
    }
}

// Video Modal
function showVideoModal() {
    const modal = document.getElementById('videoListModal');
    const container = document.getElementById('videoListContainer');

    container.innerHTML = '';

    // Build set of filenames/paths already loaded into the plugin (for greying out OwnCloud items)
    const loadedFilenames = new Set(state.videos.map(v => v.filename));

    // ── Loaded videos (plugin-side records) ─────────────────────────────────
    if (state.videos.length === 0) {
        container.innerHTML = '<p class="empty-state" style="color:#999;font-size:0.9rem;padding:0.5rem 0;">No videos loaded yet. Click an OwnCloud file below to load it.</p>';
    } else {
        state.videos.forEach(video => {
            const item = document.createElement('div');
            item.className = 'video-list-item';
            if (state.currentVideoId === video.id) {
                item.classList.add('active');
            }

            item.innerHTML = `
                <div class="video-list-name">${escapeHtml(video.filename)}</div>
                <div class="video-list-meta">
                    ${formatFileSize(video.file_size)} • ${video.annotation_count} elicitations
                </div>
                <div class="video-list-actions">
                    <button class="btn btn-icon btn-small btn-danger video-delete-btn"
                        title="Remove from plugin (does not delete OwnCloud file)"
                        onclick="event.stopPropagation(); deleteVideo(${video.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div id="videoSegments-${video.id}" class="video-segments-placeholder"></div>
            `;

            item.addEventListener('click', () => {
                loadVideo(video.id);
                closeVideoModal();
            });

            container.appendChild(item);

            // Fetch and render segments nested under this video entry
            (async () => {
                try {
                    const resp = await fetch(`${API_BASE}/api/segments/video/${video.id}`);
                    if (!resp.ok) return;
                    const segs = await resp.json();
                    if (!segs || segs.length === 0) return;
                    const segContainer = document.getElementById(`videoSegments-${video.id}`);
                    if (!segContainer) return;
                    segContainer.className = 'video-segments-list';
                    segContainer.innerHTML = segs.map(seg => `
                        <div class="video-segment-item">
                            <button class="btn btn-small" onclick="loadVideoAndSegment(${video.id}, ${seg.start_time})">
                                <i class="fas fa-play"></i> ${formatTime(seg.start_time)} → ${formatTime(seg.end_time)}
                            </button>
                            <span class="segment-name">${escapeHtml(seg.name || '')}</span>
                        </div>
                    `).join('');
                } catch (err) {
                    console.warn('Failed to load segments for video', video.id, err);
                }
            })();
        });
    }

    // ── OwnCloud personal folder ─────────────────────────────────────────────
    const ownCloudArea = document.getElementById('videoModalOwnCloudArea');
    if (ownCloudArea) {
        if (state.ownCloudFiles && state.ownCloudFiles.length > 0) {
            ownCloudArea.style.display = 'block';
            renderOwnCloudItemsForModal(state.ownCloudFiles, loadedFilenames);
        } else {
            ownCloudArea.style.display = 'none';
        }
    }

    modal.classList.add('active');
}

/**
 * Render OwnCloud files inside the Select Video modal.
 * Files already loaded into the plugin are shown greyed-out (not_loadable).
 * A trash icon on each item deletes the OwnCloud file (permanent).
 */
function renderOwnCloudItemsForModal(files, loadedFilenames) {
    const listEl = document.getElementById('videoModalOwnCloudFilesList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const videoFiles = files.filter(f => f.type === 'file');

    if (videoFiles.length === 0) {
        listEl.innerHTML = '<p style="color:#999;font-size:0.85rem;padding:0.5rem;">No video files found in your OwnCloud folder.</p>';
        return;
    }

    videoFiles.forEach(f => {
        const alreadyLoaded = loadedFilenames.has(f.name);
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.5rem 0.75rem; border-bottom: 1px solid #eee; gap: 0.5rem;
            ${alreadyLoaded ? 'opacity:0.45; pointer-events:none;' : 'cursor:pointer;'}
        `;
        if (!alreadyLoaded) {
            item.style.pointerEvents = 'auto';
            item.addEventListener('click', (e) => {
                if (e.target.closest('.oc-delete-btn')) return;
                const videoUrl = f.url || f.href || f.path || f.name;
                linkOwnCloudVideo(f.name, f.size || 0, videoUrl);
                closeVideoModal();
            });
        }

        item.innerHTML = `
            <div style="display:flex;align-items:center;gap:0.6rem;min-width:0;flex:1;">
                <i class="fas fa-video" style="color:${alreadyLoaded ? '#aaa' : '#0066cc'};flex-shrink:0;"></i>
                <div style="min-width:0;">
                    <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(f.name)}</div>
                    <div style="font-size:0.8rem;color:#888;">${f.size ? formatFileSize(f.size) : ''}</div>
                </div>
                ${alreadyLoaded ? '<span style="font-size:0.75rem;color:#888;margin-left:auto;white-space:nowrap;">already loaded</span>' : ''}
            </div>
            <button class="btn btn-icon btn-small btn-danger oc-delete-btn"
                title="Delete from OwnCloud (permanent)"
                style="flex-shrink:0;pointer-events:auto;">
                <i class="fas fa-trash"></i>
            </button>
        `;
        // Attach delete handler via data attributes (avoids HTML-attribute quoting issues with JSON.stringify)
        const deleteBtn = item.querySelector('.oc-delete-btn');
        if (deleteBtn) {
            deleteBtn._ocName = f.name;
            deleteBtn._ocPath = f.path || f.href || '';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteOwnCloudFile(e.currentTarget._ocName, e.currentTarget._ocPath);
            });
        }

        listEl.appendChild(item);
    });
}

/**
 * Delete an OwnCloud file via the WebDAV API proxy.
 * This is the ONLY way users can delete their OwnCloud files from within the plugin.
 */
async function deleteOwnCloudFile(filename, path) {
    if (!confirm(`Delete "${filename}" from OwnCloud?\n\nThis is permanent and cannot be undone.`)) return;
    if (!_webdavApiUrl) { showToast('Error', 'WebDAV API not configured', 'error'); return; }
    try {
        showLoading(`Deleting ${filename} from OwnCloud…`);
        const resp = await fetch(`${_webdavApiUrl}?action=delete&path=${encodeURIComponent(path || filename)}`, { method: 'GET' });
        hideLoading();
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.error) {
            throw new Error(data.error || `HTTP ${resp.status}`);
        }
        showToast('Deleted', `${filename} removed from OwnCloud`, 'success');

        // Also remove the local plugin record if this file was already registered
        const linkedVideo = state.videos.find(v => v.filename === filename && v.source_type === 'webdav');
        if (linkedVideo) {
            try {
                await fetch(`${API_BASE}/api/videos/${linkedVideo.id}?force=true`, { method: 'DELETE' });
            } catch (_) { /* best-effort */ }
            await loadVideos();
        }

        // Refresh OwnCloud file list and re-render modal
        await scanUserOwnCloudFolder();
        const loadedFilenames = new Set(state.videos.map(v => v.filename));
        renderOwnCloudItemsForModal(state.ownCloudFiles, loadedFilenames);
    } catch (err) {
        hideLoading();
        console.error('OwnCloud delete failed', err);
        showToast('Error', `Failed to delete: ${err.message}`, 'error');
    }
}

function closeVideoModal() {
    document.getElementById('videoListModal').classList.remove('active');
}

// OwnCloud Video Browser Functions
// Resolved once per page load
const _webdavApiUrl = new URLSearchParams(window.location.search).get('webdav_api_url') || '';
const _moodleWwwRoot = (() => {
    // Derive from webdav_api_url: strip path after /local/
    const u = _webdavApiUrl;
    const idx = u.indexOf('/local/');
    return idx !== -1 ? u.slice(0, idx) : window.location.origin;
})();

async function openOwnCloudModal() {
    const modal = document.getElementById('ownCloudModal');

    // Clear previous state (upload-only modal — do not show file browser here)
    const cfgWarn = document.getElementById('ownCloudConfigWarning'); if (cfgWarn) cfgWarn.style.display = 'none';
    const uploadArea = document.getElementById('ownCloudUploadArea'); if (uploadArea) uploadArea.style.display = 'none';
    const loadingEl = document.getElementById('ownCloudLoading'); if (loadingEl) loadingEl.style.display = 'block';

    modal.classList.add('active');

    // Check if OwnCloud is configured
    try {
        if (!_webdavApiUrl) throw new Error('WebDAV API URL not configured');

        const response = await fetch(`${_webdavApiUrl}?action=checkconfig`);
        const data = await response.json();

        if (!data.configured) {
            document.getElementById('ownCloudLoading').style.display = 'none';
            document.getElementById('ownCloudConfigWarning').style.display = 'block';
            return;
        }

        // Show upload area and wire up file input
        const uploadAreaEl = document.getElementById('ownCloudUploadArea');
        if (uploadAreaEl) uploadAreaEl.style.display = 'block';
        const fileInput = document.getElementById('ownCloudFileInput');
        fileInput.onchange = null; // clear old listener
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) await uploadToOwnCloud(file);
            fileInput.value = '';
        });

        // ownCloudModal is upload-only: do not list/browse files here.
        if (loadingEl) loadingEl.style.display = 'none';
    } catch (error) {
        console.error('Error checking OwnCloud config:', error);
        document.getElementById('ownCloudLoading').style.display = 'none';
        document.getElementById('ownCloudConfigWarning').style.display = 'block';
        showToast('Error', 'Failed to access OwnCloud', 'error');
    }
}

// ── Resumable Upload State ────────────────────────────────────────────────────
// Persists chunked-upload progress to localStorage so a page navigation mid-upload
// does not lose everything. The OwnCloud session folder (MKCOL'd under /uploads/)
// survives page close; on return the client can verify it and resume from last offset.
//
// localStorage key: oc_pending_upload_{encodeURIComponent(filename)}
// Value JSON: { uploadId, filename, filesize, nextOffset, startedAt }
// nextOffset is written BEFORE each chunk PUT — if the page closes during a PUT,
// the worst case is that chunk is re-sent (OwnCloud PUT is idempotent by offset).

function saveUploadState(filename, uploadId, filesize, nextOffset) {
    try {
        localStorage.setItem(
            'oc_pending_upload_' + encodeURIComponent(filename),
            JSON.stringify({ uploadId, filename, filesize, nextOffset, startedAt: Date.now() })
        );
    } catch (e) { console.warn('saveUploadState failed', e); }
}

function clearUploadState(filename) {
    try { localStorage.removeItem('oc_pending_upload_' + encodeURIComponent(filename)); }
    catch (e) { console.warn('clearUploadState failed', e); }
}

function loadPendingUploads() {
    const pending = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('oc_pending_upload_')) {
                try {
                    const val = JSON.parse(localStorage.getItem(key));
                    if (val && val.uploadId && val.filename) pending.push(val);
                } catch (_) { localStorage.removeItem(key); }
            }
        }
    } catch (e) { console.warn('loadPendingUploads failed', e); }
    return pending;
}

/**
 * Check localStorage for interrupted uploads, verify each against OwnCloud via
 * chunkstatus, and show a resume banner for any that still have a live session.
 * Called from initializeApp() and from the selectVideoBtn click handler.
 */
async function checkAndOfferResumeUploads() {
    if (!_webdavApiUrl) return;
    const pending = loadPendingUploads();
    for (const saved of pending) {
        try {
            const params = new URLSearchParams({ action: 'chunkstatus', upload_id: saved.uploadId });
            const res  = await fetch(`${_webdavApiUrl}?${params}`, { method: 'GET' });
            const data = await res.json();
            if (!data.exists) { clearUploadState(saved.filename); continue; }

            // Compute resume offset from what OwnCloud has confirmed
            let resumeOffset = saved.nextOffset;
            if (data.chunks && data.chunks.length > 0) {
                const ocNext = Math.max(...data.chunks) + CHUNK_SIZE;
                resumeOffset = Math.min(Math.max(ocNext, saved.nextOffset), saved.filesize);
            }
            _showResumeBanner(saved.filename, saved.filesize,
                { uploadId: saved.uploadId, nextOffset: resumeOffset });
        } catch (e) { console.warn('Resume check error for', saved.filename, e); }
    }
}

/**
 * Render a "resume upload" banner inside the floating upload panel.
 * The user must re-select the file (browser security: File objects don't survive navigation).
 */
function _showResumeBanner(filename, filesize, resumeState) {
    const bannerId = 'resume-banner-' + encodeURIComponent(filename);
    if (document.getElementById(bannerId)) return;

    ensureUploadPanel();
    const list = document.getElementById('uploadProgressList');
    if (!list) return;

    const resumedMB = (resumeState.nextOffset / 1048576).toFixed(1);
    const totalMB   = (filesize / 1048576).toFixed(1);
    const shortName = filename.length > 35 ? filename.slice(0, 32) + '...' : filename;

    const banner = document.createElement('div');
    banner.id = bannerId;
    banner.style.cssText = 'margin-bottom:10px;padding:8px;background:#fff3cd;border:1px solid #ffc107;border-radius:6px;font-size:0.85rem;';

    const msg = document.createElement('div');
    msg.style.marginBottom = '4px';
    msg.textContent = `Incomplete upload: ${shortName} (${resumedMB} / ${totalMB} MB done)`;
    banner.appendChild(msg);

    const hint = document.createElement('div');
    hint.style.cssText = 'color:#6c757d;font-size:0.78rem;margin-bottom:6px;';
    hint.textContent = 'Select the same file again to resume from where it stopped.';
    banner.appendChild(hint);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;';

    const resumeBtn = document.createElement('button');
    resumeBtn.textContent = 'Resume';
    resumeBtn.style.cssText = 'padding:4px 10px;background:#0066cc;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.82rem;';
    resumeBtn.addEventListener('click', () => {
        const fi = document.createElement('input');
        fi.type = 'file';
        fi.accept = 'video/*';
        fi.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.name !== filename) {
                showToast('Resume', `Please select "${filename}" to resume.`, 'error'); return;
            }
            if (file.size !== filesize) {
                showToast('Resume', 'File size mismatch — select the exact same file.', 'error'); return;
            }
            banner.remove();
            uploadToOwnCloud(file, resumeState);
        });
        fi.click();
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.style.cssText = 'padding:4px 10px;background:#6c757d;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.82rem;';
    dismissBtn.addEventListener('click', () => {
        clearUploadState(filename);
        banner.remove();
        const l = document.getElementById('uploadProgressList');
        if (l && !l.children.length) {
            const panel = document.getElementById('uploadProgressPanel');
            if (panel) panel.remove();
        }
    });

    btnRow.appendChild(resumeBtn);
    btnRow.appendChild(dismissBtn);
    banner.appendChild(btnRow);
    list.appendChild(banner);
}
// ── End Resumable Upload State ─────────────────────────────────────────────────

/**
 * Upload a file to OwnCloud via the PHP proxy using OwnCloud DAV chunking 1.0.
 * Chunks are sent sequentially (10 MB each) so no single request exceeds OwnCloud's
 * per-request body limit. Progress is shown in the fixed upload panel; the upload
 * button stays enabled so the user can start additional uploads concurrently.
 * Pass resumeState = { uploadId, nextOffset } to resume an interrupted upload.
 */
const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB per chunk

async function uploadToOwnCloud(file, resumeState = null) {
    if (!_webdavApiUrl) { showToast('Error', 'WebDAV API not configured', 'error'); return; }

    // Dismiss any existing resume banner for this file (fresh start or user-initiated resume).
    const _existBanner = document.getElementById('resume-banner-' + encodeURIComponent(file.name));
    if (_existBanner) _existBanner.remove();

    // Each upload gets its own row in the floating panel — button stays enabled.
    ensureUploadPanel();
    // Reuse the existing OwnCloud session when resuming; generate a new one otherwise.
    const sessionUploadId = resumeState
        ? resumeState.uploadId
        : ('oc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    updateUploadRow(file.name, 0, resumeState ? 'Resuming…' : 'Preparing…');

    // Per-file row in the inline modal upload list.
    const uploadList = document.getElementById('ownCloudUploadList');
    let inlineRow = null;
    let inlineBar = null;
    let inlinePct = null;
    let inlineStatus = null;

    if (uploadList) {
        uploadList.style.display = 'block';
        inlineRow = document.createElement('div');
        inlineRow.dataset.file = file.name;
        inlineRow.style.cssText = 'margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #e9ecef;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:3px;';
        const nameEl = document.createElement('span');
        nameEl.style.cssText = 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:75%;';
        nameEl.textContent = file.name.length > 40 ? file.name.slice(0, 37) + '…' : file.name;
        inlinePct = document.createElement('span');
        inlinePct.style.fontWeight = '600';
        inlinePct.textContent = '0%';
        header.appendChild(nameEl);
        header.appendChild(inlinePct);
        inlineRow.appendChild(header);

        const barTrack = document.createElement('div');
        barTrack.style.cssText = 'height:6px; background:#dee2e6; border-radius:999px; overflow:hidden;';
        inlineBar = document.createElement('div');
        inlineBar.style.cssText = 'height:100%; width:0; background:#0066cc; transition:width 0.2s;';
        barTrack.appendChild(inlineBar);
        inlineRow.appendChild(barTrack);

        inlineStatus = document.createElement('div');
        inlineStatus.style.cssText = 'font-size:0.8rem; color:#666; margin-top:3px;';
        inlineRow.appendChild(inlineStatus);

        uploadList.appendChild(inlineRow);
    }

    const updateProgress = (pct, statusText) => {
        updateUploadRow(file.name, pct, statusText);
        if (inlineBar) inlineBar.style.width = pct + '%';
        if (inlinePct) inlinePct.textContent = pct + '%';
        if (inlineStatus) inlineStatus.textContent = statusText || '';
    };

    const setError = (msg) => {
        updateUploadRow(file.name, 0, '✗ ' + msg, true);
        if (inlineStatus) { inlineStatus.textContent = '✗ ' + msg; inlineStatus.style.color = '#dc3545'; }
        if (inlineBar) inlineBar.style.background = '#dc3545';
    };

    try {
        // Step 1: Ensure destination folder exists on OwnCloud.
        await fetch(`${_webdavApiUrl}?action=ensureuserfolder`, { method: 'GET' });

        // Step 2: Create the OwnCloud upload session (MKCOL /uploads/{uuid}/{session_id}/).
        // Skip when resuming — the session folder already exists on OwnCloud.
        if (!resumeState) {
            const startParams = new URLSearchParams({ action: 'chunkstart', upload_id: sessionUploadId, filename: file.name });
            const startRes = await fetch(`${_webdavApiUrl}?${startParams}`, { method: 'POST' });
            const startData = await startRes.json();
            if (!startData.success) throw new Error(startData.error || 'Failed to start chunked upload');
        }

        // Step 3: Send chunks sequentially, starting from resumeState.nextOffset when resuming.
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const startChunk  = resumeState ? Math.floor(resumeState.nextOffset / CHUNK_SIZE) : 0;
        for (let i = startChunk; i < totalChunks; i++) {
            const offset = i * CHUNK_SIZE;
            const chunk  = file.slice(offset, offset + CHUNK_SIZE);
            const fd     = new FormData();
            fd.append('chunk', chunk, file.name);

            const chunkParams = new URLSearchParams({ action: 'chunkput', upload_id: sessionUploadId, offset: String(offset) });
            const pct = Math.round((offset / file.size) * 100);
            const uploadedMB = (offset / 1048576).toFixed(1);
            const totalMB    = (file.size  / 1048576).toFixed(1);
            updateProgress(pct, `${uploadedMB} / ${totalMB} MB`);

            // Persist state BEFORE sending — if the page closes mid-PUT, this offset is recoverable.
            saveUploadState(file.name, sessionUploadId, file.size, offset);

            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${_webdavApiUrl}?${chunkParams}`);
                xhr.addEventListener('load', () => {
                    try {
                        const res = JSON.parse(xhr.responseText);
                        if (xhr.status >= 200 && xhr.status < 300 && res.success) resolve(res);
                        else reject(new Error(res.error || `Chunk HTTP ${xhr.status}`));
                    } catch (e) { reject(new Error('Invalid chunk response')); }
                });
                xhr.addEventListener('error', () => reject(new Error('Network error on chunk ' + i)));
                xhr.send(fd);
            });
        }

        // Step 4: MOVE assembled chunks to final destination and register in Moodle DB.
        updateProgress(99, 'Assembling…');
        if (inlinePct) inlinePct.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:0.9em;"></i>';

        const finishParams = new URLSearchParams({
            action:    'chunkfinish',
            upload_id: sessionUploadId,
            filename:  file.name,
            filesize:  String(file.size),
        });

        let finishData = null;
        try {
            const finishRes = await fetch(`${_webdavApiUrl}?${finishParams}`, { method: 'POST' });
            const text = await finishRes.text();
            try { finishData = JSON.parse(text); } catch (_) { /* non-JSON body — see below */ }
        } catch (netErr) {
            // network-level failure — fall through to assembly polling
        }

        // If chunkfinish returned a gateway error (504 etc.) or non-JSON, OwnCloud may still
        // be assembling chunks. Poll registerupload every 10 s with no cap — assembly of a
        // 6 GB file can take many minutes. Only give up after 15 min of no progress.
        if (!finishData?.success) {
            if (finishData?.error && !finishData.error.match(/gateway|timeout|504/i)) {
                // Definitive API error — clear state and surface it
                clearUploadState(file.name);
                throw new Error(finishData.error);
            }
            const assemblyStart   = Date.now();
            const MAX_ASSEMBLY_MS = 15 * 60 * 1000; // 15 minutes
            while (true) {
                await new Promise(r => setTimeout(r, 10_000)); // 10 s between polls
                const elapsed = Math.round((Date.now() - assemblyStart) / 1000);
                updateProgress(99, `Assembling… (${elapsed} s)`);
                if (inlinePct) inlinePct.innerHTML =
                    `<i class="fas fa-spinner fa-spin" style="font-size:0.9em;"></i> ${elapsed}s`;
                const checkParams = new URLSearchParams({
                    action:    'registerupload',
                    filename:  file.name,
                    file_path: `Moodle_OwnCloud_Storage/Users/${window.USER_ID || ''}/${file.name}`,
                    filesize:  String(file.size),
                });
                try {
                    const checkRes  = await fetch(`${_webdavApiUrl}?${checkParams}`, { method: 'GET' });
                    const checkData = JSON.parse(await checkRes.text());
                    if (checkData.success) { finishData = checkData; break; }
                    // 422 = "not found yet" — keep polling
                    if (checkRes.status !== 422 && checkData.error && !checkData.error.match(/not found/i)) {
                        clearUploadState(file.name);
                        throw new Error(checkData.error || `Unexpected status ${checkRes.status}`);
                    }
                } catch (pollErr) {
                    if (pollErr.message?.startsWith('Unexpected')) throw pollErr;
                    console.warn('Assembly poll transient error:', pollErr.message);
                }
                if (Date.now() - assemblyStart > MAX_ASSEMBLY_MS) {
                    // Do NOT clear state — chunks are on OwnCloud; user can retry on next visit.
                    throw new Error('Assembly exceeded 15 minutes — check OwnCloud server load');
                }
            }
        }

        const moodleVideoId = finishData.moodle_id;

        // Step 5: Register in FastAPI backend.
        if (moodleVideoId) {
            const streamUrl = `${_moodleWwwRoot}/local/videoelicit/stream.php?videoid=${moodleVideoId}`;
            await fetch(`${API_BASE}/api/videos/webdav/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stream_url:      streamUrl,
                    filename:        file.name,
                    file_size:       file.size,
                    moodle_video_id: moodleVideoId,
                }),
            });
        }

        // Clear persisted state — upload finished successfully.
        clearUploadState(file.name);

        updateProgress(100, '✓ Upload complete!');
        if (inlineStatus) { inlineStatus.textContent = '✓ Upload complete!'; inlineStatus.style.color = '#28a745'; }

        await browseOwnCloudDirectory('/');
        await loadVideos();

        setTimeout(() => {
            removeUploadRow(file.name);
            if (inlineRow && inlineRow.parentNode) {
                inlineRow.remove();
                if (uploadList && !uploadList.children.length) uploadList.style.display = 'none';
            }
        }, 4000);

    } catch (err) {
        console.error('OwnCloud upload error:', err);
        setError(err.message || 'Upload failed');
    }
}

function closeOwnCloudModal() {
    document.getElementById('ownCloudModal').classList.remove('active');
}

async function browseOwnCloudDirectory(path) {
    try {
        const loadingEl = document.getElementById('ownCloudLoading');
        const browserEl = document.getElementById('ownCloudBrowser');
        if (loadingEl) loadingEl.style.display = 'block';
        if (browserEl) browserEl.style.display = 'none';
        
        const webdavApiUrl = new URLSearchParams(window.location.search).get('webdav_api_url');
        if (!webdavApiUrl) {
            throw new Error('WebDAV API URL not configured');
        }
        
        const response = await fetch(`${webdavApiUrl}?action=browse&path=${encodeURIComponent(path)}`);
        if (!response.ok) {
            // Try to extract server-provided error text/json to show a more helpful message
            let serverMessage = '';
            try {
                const text = await response.text();
                const parsed = text ? JSON.parse(text) : null;
                serverMessage = parsed && parsed.error ? parsed.error : (text || '');
            } catch (e) {
                /* ignore parse errors - fall back to status code */
            }
            throw new Error(`Failed to browse directory: ${response.status}${serverMessage ? ' — ' + serverMessage : ''}`);
        }
        
        const data = await response.json();
        
        // Update breadcrumb
        updateOwnCloudBreadcrumb(path);
        
        // Choose appropriate container (Select Video modal uses videoModalOwnCloudFilesList)
        const targetContainer = document.getElementById('videoModalOwnCloudFilesList') ? 'videoModalOwnCloudFilesList' : 'ownCloudFilesList';
        // Render files and folders into the chosen container
        renderOwnCloudItems(data.items || [], path, targetContainer);
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (browserEl) browserEl.style.display = 'block';
    } catch (error) {
        console.error('Error browsing OwnCloud directory:', error);
        showToast('Error', `Failed to browse OwnCloud directory: ${error.message}`, 'error');
        const loadingEl = document.getElementById('ownCloudLoading');
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// Recursively PROPFIND an OwnCloud path and return all files found (depth-first)
async function propfindOwnCloudRecursive(startPath = '/', maxDepth = 10, maxFiles = 5000) {
    if (!_webdavApiUrl) throw new Error('WebDAV API URL not configured');

    const collected = [];
    let fileCount = 0;

    async function walk(path, depth) {
        if (depth > maxDepth) return;

        const resp = await fetch(`${_webdavApiUrl}?action=browse&path=${encodeURIComponent(path)}`);
        if (!resp.ok) {
            // Try to surface server-provided error payload (JSON or plain text)
            let body = await resp.text();
            try { body = JSON.parse(body); } catch (e) { /* keep as text */ }
            throw new Error(`Browse failed for ${path}: HTTP ${resp.status} - ${typeof body === 'string' ? body : JSON.stringify(body)}`);
        }
        const data = await resp.json();
        const items = data.items || [];

        for (const it of items) {
            if (it.type === 'folder') {
                const subpath = path.endsWith('/') ? path + it.name : path + '/' + it.name;
                await walk(subpath, depth + 1);
                if (fileCount >= maxFiles) return;
            } else if (it.type === 'file') {
                collected.push({ ...it, parentPath: path });
                fileCount++;
                if (fileCount >= maxFiles) return;
            }
        }
    }

    await walk(startPath, 0);
    return collected;
}

// Ensure and scan the user's personal OwnCloud folder (uses ensureuserfolder endpoint)
async function scanUserOwnCloudFolder() {
    if (!_webdavApiUrl) throw new Error('WebDAV API URL not configured');

    // Ensure folder exists and get the relative path
    const ensureRes = await fetch(`${_webdavApiUrl}?action=ensureuserfolder`);
    if (!ensureRes.ok) {
        const txt = await ensureRes.text();
        throw new Error(`ensureuserfolder failed: ${ensureRes.status} - ${txt}`);
    }
    const ensureJson = await ensureRes.json();
    const folderPath = ensureJson.folder_path ? (`/` + ensureJson.folder_path.replace(/^\//, '')) : '/';

    // Try recursive PROPFIND of the user's folder. If it fails (remote permission/PROPFIND error),
    // fall back to a conservative scan from root with limited depth so we still discover some files.
    try {
        const files = await propfindOwnCloudRecursive(folderPath, 20, 5000);
        state.ownCloudFiles = files;
        return files;
    } catch (err) {
        console.warn('User-folder PROPFIND failed, attempting discovery fallbacks:', err.message);

        // 1) Try to discover user's folder by scanning the base/root tree shallowly
        try {
            const discoveryItems = await propfindOwnCloudRecursive('/', 3, 2000);
            const userid = (typeof window !== 'undefined' && window.USER_ID) ? window.USER_ID : null;

            // Prefer paths that contain 'Users/{id}' or 'Moodle_OwnCloud_Storage'
            let candidatePath = null;
            if (userid) {
                const match = discoveryItems.find(i => i.path && i.path.includes(`/Users/${userid}`));
                if (match) candidatePath = match.parentPath || ('/' + match.path.replace(/^\//, ''));
            }

            if (!candidatePath) {
                const mos = discoveryItems.find(i => i.name && i.name.toLowerCase().includes('moodle_owncloud_storage'));
                if (mos) candidatePath = mos.parentPath || ('/' + mos.path.replace(/^\//, ''));
            }

            if (candidatePath) {
                try {
                    const files = await propfindOwnCloudRecursive(candidatePath, 10, 5000);
                    state.ownCloudFiles = files;
                    showToast('Warning', `User-folder discovery succeeded (scanned ${candidatePath})`, 'warning');
                    return files;
                } catch (e2) {
                    console.warn('Discovery candidate scan failed:', e2.message);
                }
            }
        } catch (discoveryErr) {
            console.warn('Discovery scan failed:', discoveryErr.message);
        }

        // 2) Conservative fallback: scan '/' with small depth to avoid heavy operations
        try {
            const fallbackFiles = await propfindOwnCloudRecursive('/', 3, 500);
            state.ownCloudFiles = fallbackFiles;
            showToast('Warning', 'Full user-folder scan failed — used limited fallback (root) scan', 'warning');
            return fallbackFiles;
        } catch (err2) {
            console.error('Fallback OwnCloud scan also failed:', err2);
            throw err; // rethrow original error for caller visibility
        }
    }
}

function updateOwnCloudBreadcrumb(path) {
    const breadcrumbBtn = document.querySelector('[data-path="/"]');
    if (breadcrumbBtn) {
        breadcrumbBtn.addEventListener('click', () => browseOwnCloudDirectory('/'));
    }
    
    const breadcrumbPathEl = document.getElementById('breadcrumbPath');
    if (breadcrumbPathEl) {
        if (path !== '/') {
            const parts = path.split('/').filter(p => p);
            let html = ' / ';
            let currentPath = '/';
            
            parts.forEach((part, index) => {
                currentPath += part + (index === parts.length - 1 ? '' : '/');
                const isLast = index === parts.length - 1;
                if (isLast) {
                    html += `<span style="color: #0066cc; font-weight: 600;">${part}</span>`;
                } else {
                    html += `<button class="breadcrumb-btn" data-path="${currentPath}" style="margin: 0 0.25rem;">${part}</button>`;
                }
            });
            
            breadcrumbPathEl.innerHTML = html;
            
            // Add click handlers to breadcrumb buttons
            document.querySelectorAll('[data-path]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const p = btn.dataset.path;
                    browseOwnCloudDirectory(p);
                });
            });
        } else {
            breadcrumbPathEl.innerHTML = '';
        }
    }
    
    const ownCloudBreadcrumbEl = document.getElementById('ownCloudBreadcrumb');
    if (ownCloudBreadcrumbEl) ownCloudBreadcrumbEl.style.display = 'block';
}

function renderOwnCloudItems(items, currentPath, containerId) {
    containerId = containerId || 'ownCloudFilesList';
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    if (!items || items.length === 0) {
        container.innerHTML = '<div style="padding: 1rem; text-align: center; color: #999;">No files or folders found</div>';
        return;
    }
    
    // Separate folders and files
    const folders = items.filter(item => item.type === 'folder');
    const files = items.filter(item => item.type === 'file');
    
    // Render folders first
    folders.forEach(folder => {
        const item = document.createElement('div');
        item.className = 'owncloud-item folder-item';
        item.style.padding = '0.75rem';
        item.style.borderBottom = '1px solid #eee';
        item.style.cursor = 'pointer';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '0.75rem';
        
        item.innerHTML = `
            <i class="fas fa-folder" style="color: #ffb81c; font-size: 1.2rem;"></i>
            <span style="flex-grow: 1; font-weight: 500;">${folder.name}</span>
        `;
        
        item.addEventListener('click', () => {
            const newPath = currentPath.endsWith('/') ? currentPath + folder.name : currentPath + '/' + folder.name;
            browseOwnCloudDirectory(newPath);
        });
        
        container.appendChild(item);
    });
    
    // Render video files
    files.forEach(file => {
        // Defensive: trim trailing slashes from name provided by server
        const safeName = (file.name || '').replace(/\/+$/g, '');
        const isVideo = /\.(mp4|webm|ogg|avi|mov|mkv|flv|wmv|m4v)$/i.test(safeName);
        
        const item = document.createElement('div');
        item.className = 'owncloud-item file-item';
        item.style.padding = '0.75rem';
        item.style.borderBottom = '1px solid #eee';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '0.75rem';
        
        if (isVideo) {
            item.style.cursor = 'pointer';
            item.style.backgroundColor = '#f5f5f5';
        } else {
            item.style.opacity = '0.6';
        }
        
        const fileSize = file.size ? formatFileSize(file.size) : 'Unknown';
        item.innerHTML = `
            <i class="fas ${isVideo ? 'fa-video' : 'fa-file'}" style="color: ${isVideo ? '#0066cc' : '#999'}; font-size: 1.1rem;"></i>
            <div style="flex-grow: 1;">
                <div style="font-weight: ${isVideo ? '500' : '400'}">${safeName}</div>
                <div style="font-size: 0.85rem; color: #666;">${fileSize}</div>
            </div>
        `;
        
        if (isVideo) {
            item.addEventListener('click', () => {
                const videoUrl = file.url || `${currentPath}${currentPath.endsWith('/') ? '' : '/'}${safeName}`;
                linkOwnCloudVideo(safeName, file.size, videoUrl);
            });
        }
        
        container.appendChild(item);
    });
}

async function linkOwnCloudVideo(filename, fileSize, videoUrl) {
    try {
        showLoading('Linking video…');

        if (!_webdavApiUrl) throw new Error('WebDAV API URL not configured');

        // Step 1: Register in Moodle DB (idempotent)
        // Send form-encoded POST so Moodle's required_param() picks up values reliably
        const params = new URLSearchParams();
        params.append('url', videoUrl);
        params.append('filename', filename);
        params.append('filesize', String(fileSize || 0));

        const linkRes = await fetch(`${_webdavApiUrl}?action=link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });
        if (!linkRes.ok) {
            // try to extract server message
            let txt = await linkRes.text();
            try { txt = JSON.parse(txt).error || txt; } catch (e) { /* keep as text */ }
            throw new Error(`Link failed: HTTP ${linkRes.status} - ${txt}`);
        }
        const linkData = await linkRes.json();
        if (!linkData.success) throw new Error(linkData.error || 'Link failed');

        const moodleVideoId = linkData.video.id;

        // Step 2: Register in FastAPI using stream.php as the filepath
        const streamUrl = `${_moodleWwwRoot}/local/videoelicit/stream.php?videoid=${moodleVideoId}`;
        const regRes = await fetch(`${API_BASE}/api/videos/webdav/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stream_url:      streamUrl,
                filename,
                file_size:       fileSize || 0,
                moodle_video_id: moodleVideoId,
            }),
        });
        const regData = await regRes.json();

        // Step 3: Load the video directly
        await loadVideos();
        // close whichever modal was used
        closeOwnCloudModal();
        closeVideoModal();
        await loadVideo(regData.id);

        showToast('Success', `Video "${filename}" linked successfully`, 'success');
    } catch (error) {
        console.error('Error linking OwnCloud video:', error);
        showToast('Error', error.message || 'Failed to link video', 'error');
    } finally {
        hideLoading();
    }
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

        // Update video info
        document.getElementById('videoName').textContent = video.filename;
        document.getElementById('annotationCount').textContent = video.annotation_count;

        // Load annotations
        await loadAnnotations(videoId);

        // Fetch segments and populate the elicit-controls segment selector
        try {
            const segResp = await fetch(`${API_BASE}/api/segments/video/${videoId}`);
            if (segResp.ok) {
                state.segments = await segResp.json() || [];
                refreshSegmentSelector();
            }
        } catch (_) { /* non-fatal */ }

        showToast('Video Loaded', video.filename, 'success');
    } catch (error) {
        console.error('Error loading video:', error);
        showToast('Error', 'Failed to load video', 'error');
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
        // Attach task if provided
        try {
            if (state.task && state.task.trim().length > 0) {
                formData.append('task', state.task.trim());
            }
        } catch (e) {
            console.warn('Could not append task to FormData', e);
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

        const raw = await response.json();
        // tags may arrive as a JSON string — parse it to an array for the renderer
        state.annotations = raw.map(ann => {
            if (ann.tags && typeof ann.tags === 'string') {
                try { ann.tags = JSON.parse(ann.tags); } catch (e) { ann.tags = []; }
            }
            return ann;
        });

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

    sortedAnnotations.forEach(annotation => {
        const item = document.createElement('div');
        item.className = 'annotation-item';
        item.dataset.id = annotation.id;

        const duration = annotation.end_time - annotation.start_time;
        const statusText = getStatusText(annotation.transcription_status);
        const statusClass = annotation.transcription_status;

        // --- Task badge: user-set task takes priority, falls back to detected_task ---
        const displayTask = annotation.task || annotation.detected_task;
        let taskBadgeHTML = '';
        if (displayTask) {
            taskBadgeHTML = `
                <span class="detected-task-badge editable" onclick="startEditTask(${annotation.id})" title="Click to edit task">
                    <strong id="task-display-${annotation.id}">${escapeHtml(displayTask)}</strong>
                    <i class="fas fa-pencil-alt task-edit-icon"></i>
                </span>`;
        }

        // --- Tags ---
        let tagsHTML = '';
        if (annotation.transcription_status === 'completed') {
            if (annotation.tagging_status === 'processing') {
                tagsHTML = `<div class="tagging-progress"><i class="fa-solid fa-tag"></i> <span>Generating tags...</span></div>`;
            } else if (annotation.tagging_status === 'completed' && annotation.tags && annotation.tags.length > 0) {
                const tagsInner = annotation.tags.map((tag, idx) => {
                    const cat = tag.category || '';
                    return `<span class="annotation-tag category-${cat}" title="${escapeHtml(cat)} - Click to delete" onclick="deleteTag(event, ${annotation.id}, ${idx})">${escapeHtml(tag.name)}</span>`;
                }).join('');
                tagsHTML = `<div class="annotation-tags">${tagsInner}</div>`;
            }
        }

        // --- Relaunch tagging button (shown once transcription done) ---
        let relaunchTaggingBtn = '';
        if (annotation.transcription_status === 'completed') {
            relaunchTaggingBtn = `<button class="btn btn-icon btn-tiny" onclick="event.stopPropagation(); triggerTagging(${annotation.id});" title="Relaunch tagging"><i class="fa-solid fa-tags"></i></button>`;
        }

        // --- Review panel ---
        let reviewPanelHTML = '';
        if (annotation.review_status === 'processing') {
            reviewPanelHTML = `<div class="review-panel-container"><div class="ai-pipeline-status"><i class="fa-solid fa-magnifying-glass"></i> <span>AI Review in progress...</span></div></div>`;
        } else if (annotation.review_status === 'completed' && annotation.review_results) {
            let rr = annotation.review_results;
            if (typeof rr === 'string') { try { rr = JSON.parse(rr); } catch(e) { rr = {}; } }

            const tier = rr.completeness_tier || 'MINIMAL';
            const tierColors = { MINIMAL: '#dc3545', PARTIAL: '#ffc107', SUBSTANTIAL: '#17a2b8', COMPLETE: '#28a745' };
            const tierLabels = { MINIMAL: 'Minimal', PARTIAL: 'Partiel', SUBSTANTIAL: 'Substantiel', COMPLETE: 'Complet' };
            const tierColor = tierColors[tier] || '#6c757d';
            const tierLabel = tierLabels[tier] || tier;

            const sa = rr.sensations_analysis || {};
            const sensationTypes = [
                { key: 'visual_mentioned', label: 'Visuel', icon: 'fa-eye', cls: 'visual' },
                { key: 'tactile_mentioned', label: 'Tactile', icon: 'fa-hand', cls: 'tactile' },
                { key: 'auditory_mentioned', label: 'Auditif', icon: 'fa-ear-listen', cls: 'auditory' },
                { key: 'proprioceptive_mentioned', label: 'Proprioceptif', icon: 'fa-person', cls: 'proprioceptive' },
            ];
            const sensationBadges = sensationTypes
                .filter(s => sa[s.key])
                .map(s => `<span class="sensation-badge ${s.cls}"><i class="fa-solid ${s.icon}"></i> ${s.label}</span>`)
                .join('');

            const dims = rr.dimensions || {};
            const dimOrder = ['HOW', 'EVALUATION', 'FEEDBACK'];
            let dimsHTML = '';
            dimOrder.forEach(dimKey => {
                const dim = dims[dimKey];
                if (!dim) return;
                const covered = dim.covered;
                const cardClass = covered ? 'complete' : 'incomplete';
                const checkIcon = covered ? '✓' : '✗';
                const statusLabel = covered ? 'Complet' : 'Incomplet';

                let whatIsGoodHTML = '';
                if (covered && dim.what_is_good && dim.what_is_good.length > 0) {
                    const items = dim.what_is_good.map(w => `<li>${escapeHtml(w)}</li>`).join('');
                    whatIsGoodHTML = `<div class="what-is-good"><strong>✓ Ce qui est bien :</strong><ul>${items}</ul></div>`;
                }

                let missingHTML = '';
                if (!covered && dim.missing_elements && dim.missing_elements.length > 0) {
                    missingHTML = `<p class="missing-elements"><em>Manque: ${escapeHtml(dim.missing_elements.join(', '))}</em></p>`;
                }

                let promptsHTML = '';
                if (!covered && dim.prompts && dim.prompts.length > 0) {
                    const promptItems = dim.prompts.map(p => `<div class="prompt-item"><span>${escapeHtml(p)}</span></div>`).join('');
                    promptsHTML = `<div class="prompts-list">${promptItems}</div>`;
                }

                const contentStyle = covered ? 'display: block;' : 'display: none;';
                dimsHTML += `
                    <div class="dimension-card ${cardClass}" onclick="toggleDimension(${annotation.id}, '${dimKey}')">
                        <div class="dimension-header">
                            <strong>${checkIcon} ${dimKey}</strong>
                            <span>${statusLabel}</span>
                        </div>
                        <div class="dimension-content" id="dim-${annotation.id}-${dimKey}" style="${contentStyle}">
                            ${whatIsGoodHTML}${missingHTML}${promptsHTML}
                        </div>
                    </div>`;
            });

            const readyToComplete = rr.ready_to_proceed;
            const relaunchReviewBtn = `<button class="btn btn-icon btn-tiny" onclick="triggerReview(${annotation.id})" title="Relaunch AI Review"><i class="fa-solid fa-arrow-rotate-right"></i></button>`;

            const panelOpen = !!state.showReviewPanels[annotation.id];
            reviewPanelHTML = `
                <div class="review-panel-container">
                    <div class="review-toggle-header" onclick="toggleReviewPanel(${annotation.id})">
                        <span class="review-toggle-label">
                            <i class="fa-solid fa-magnifying-glass"></i>
                            AI Review
                            <span class="tier-badge" style="background-color: ${tierColor}">${tierLabel}</span>
                        </span>
                        <span class="review-toggle-indicator"><i class="fa-solid fa-chevron-${panelOpen ? 'up' : 'down'}"></i></span>
                    </div>
                    <div class="review-panel ${panelOpen ? 'visible' : ''}" id="review-panel-${annotation.id}">
                        <div class="review-header-row">
                            <div class="review-header">
                                <div class="sensations-badges">${sensationBadges}</div>
                            </div>
                            ${relaunchReviewBtn}
                        </div>
                        ${dimsHTML}
                        <div class="review-actions">
                            <button class="btn edit-elicitation-btn" onclick="editElicitation(${annotation.id})">
                                <i class="fa-solid fa-pencil"></i> Modifier l'élicitation
                            </button>
                            <button class="btn mark-complete-btn ${readyToComplete ? '' : 'disabled'}" onclick="markElicitationComplete(${annotation.id})" ${readyToComplete ? '' : 'disabled'}>
                                <i class="fa-solid fa-check"></i> Marquer comme complet
                            </button>
                        </div>
                    </div>
                </div>`;
        }

        item.innerHTML = `
            <div class="annotation-header">
                <div class="annotation-time-wrapper">
                    <span class="annotation-time">
                        ${formatTime(annotation.start_time)} - ${formatTime(annotation.end_time)}
                        (${duration.toFixed(1)}s)
                    </span>
                    ${taskBadgeHTML}
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
                ${relaunchTaggingBtn}
            </div>
            ${tagsHTML}
            ${reviewPanelHTML}
        `;

        item.addEventListener('click', (e) => {
            if (!e.target.closest('button') && !e.target.closest('.review-toggle-header') && !e.target.closest('.dimension-card')) {
                seekToAnnotation(annotation.start_time);
            }
        });

        container.appendChild(item);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toggleReviewPanel(annotationId) {
    state.showReviewPanels[annotationId] = !state.showReviewPanels[annotationId];
    renderAnnotations();
}

function toggleDimension(annotationId, dimKey) {
    const content = document.getElementById(`dim-${annotationId}-${dimKey}`);
    if (!content) return;
    content.style.display = content.style.display === 'none' ? 'block' : 'none';
}

async function triggerTagging(annotationId) {
    try {
        const response = await fetch(`${API_BASE}/api/annotations/${annotationId}/tags`, {
            method: 'POST'
        });
        if (!response.ok) throw new Error('Failed to trigger tagging');
        showToast('Tagging', 'Tag generation started', 'info');
    } catch (err) {
        showToast('Error', err.message, 'error');
    }
}

async function triggerReview(annotationId) {
    try {
        const response = await fetch(`${API_BASE}/api/annotations/${annotationId}/review`, {
            method: 'POST'
        });
        if (!response.ok) throw new Error('Failed to trigger review');
        showToast('Review', 'AI review started', 'info');
    } catch (err) {
        showToast('Error', err.message, 'error');
    }
}

async function deleteTag(event, annotationId, tagIndex) {
    event.stopPropagation();
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (!annotation || !annotation.tags) return;
    const newTags = annotation.tags.filter((_, i) => i !== tagIndex);
    try {
        const response = await fetch(`${API_BASE}/api/annotations/${annotationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: JSON.stringify(newTags) })
        });
        if (!response.ok) throw new Error('Failed to delete tag');
        annotation.tags = newTags;
        renderAnnotations();
    } catch (err) {
        showToast('Error', err.message, 'error');
    }
}

function startEditTask(annotationId) {
    const display = document.getElementById(`task-display-${annotationId}`);
    if (!display) return;
    const current = display.textContent.trim();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.className = 'task-edit-input';
    input.onclick = e => e.stopPropagation();

    const badge = display.closest('.detected-task-badge');
    badge.replaceWith(input);
    input.focus();

    async function saveTask() {
        const newTask = input.value.trim();
        try {
            const response = await fetch(`${API_BASE}/api/annotations/${annotationId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ detected_task: newTask || null })
            });
            if (!response.ok) throw new Error('Failed to update task');
            const ann = state.annotations.find(a => a.id === annotationId);
            if (ann) ann.detected_task = newTask || null;
            renderAnnotations();
        } catch (err) {
            showToast('Error', err.message, 'error');
            renderAnnotations();
        }
    }

    input.addEventListener('blur', saveTask);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { renderAnnotations(); }
    });
}

function editElicitation(annotationId) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (!annotation) return;

    const existing = document.getElementById('editElicitationModal');
    if (existing) existing.remove();

    let review = annotation.review_results;
    if (typeof review === 'string') { try { review = JSON.parse(review); } catch(e) { review = null; } }

    const priorityPromptsHTML = review && review.priority_prompts && review.priority_prompts.length > 0
        ? `<div class="elicitation-priority-prompts">
            <strong>Points à adresser en priorité :</strong>
            <ul>${review.priority_prompts.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
        </div>` : '';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'editElicitationModal';
    modal.innerHTML = `
        <div class="modal-content elicitation-modal-content">
            <div class="elicitation-modal-header">
                <h2 class="elicitation-modal-title">Modifier l'élicitation</h2>
                <button class="elicitation-modal-close" onclick="closeEditElicitationModal()" title="Fermer" aria-label="Fermer">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="elicitation-modal-body">
                ${priorityPromptsHTML}
                <label class="elicitation-textarea-label" for="elicitationTextEdit">Transcription</label>
                <textarea id="elicitationTextEdit" rows="10">${escapeHtml(annotation.transcription || '')}</textarea>
            </div>
            <div class="elicitation-modal-footer">
                <button class="btn btn-secondary" onclick="closeEditElicitationModal()">Annuler</button>
                <button class="btn btn-primary" onclick="saveElicitationEdit(${annotationId})">
                    <i class="fa-solid fa-rotate-right"></i> Enregistrer et re-analyser
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    modal.addEventListener('click', (e) => { if (e.target === modal) closeEditElicitationModal(); });
    document.getElementById('elicitationTextEdit').focus();
}

function closeEditElicitationModal() {
    const modal = document.getElementById('editElicitationModal');
    if (modal) modal.remove();
}

async function saveElicitationEdit(annotationId) {
    const textarea = document.getElementById('elicitationTextEdit');
    const newTranscription = textarea ? textarea.value.trim() : '';
    if (!newTranscription) {
        showToast('Erreur', 'La transcription ne peut pas être vide', 'error');
        return;
    }
    try {
        showLoading('Saving...');
        const updateResponse = await fetch(`${API_BASE}/api/annotations/${annotationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcription: newTranscription })
        });
        if (!updateResponse.ok) throw new Error('Failed to update transcription');

        const annotation = state.annotations.find(a => a.id === annotationId);
        if (annotation) {
            annotation.transcription = newTranscription;
            annotation.review_status = 'pending';
            annotation.review_results = null;
        }

        await fetch(`${API_BASE}/api/annotations/${annotationId}/review`, { method: 'POST' });

        closeEditElicitationModal();
        showToast('Succès', 'Élicitation mise à jour, re-analyse en cours', 'success');
        renderAnnotations();
    } catch (error) {
        showToast('Erreur', error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function markElicitationComplete(annotationId) {
    try {
        const response = await fetch(`${API_BASE}/api/annotations/${annotationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ review_status: 'skipped' })
        });
        if (!response.ok) throw new Error('Failed to mark as complete');
        const annotation = state.annotations.find(a => a.id === annotationId);
        if (annotation) annotation.review_status = 'skipped';
        showToast('Succès', 'Élicitation marquée comme complète', 'success');
        renderAnnotations();
    } catch (error) {
        showToast('Erreur', error.message, 'error');
    }
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

        // Position bar at start_time (vertical bar, not segment)
        const startPercent = (annotation.start_time / duration) * 100;
        bar.style.left = `${startPercent}%`;

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

        // // Tags section
        // if (annotation.tags && annotation.tags.length > 0) {
        //     const tagsContainer = document.createElement('div');
        //     tagsContainer.className = 'timeline-tooltip-tags';

        //     annotation.tags.forEach(tag => {
        //         const tagSpan = document.createElement('span');
        //         tagSpan.className = 'timeline-tooltip-tag';
        //         if (tag.category) {
        //             tagSpan.classList.add(`category-${tag.category}`);
        //         }
        //         tagSpan.textContent = tag.name;
        //         tagsContainer.appendChild(tagSpan);
        //     });

        //     tooltip.appendChild(tagsContainer);
        // } else if (annotation.tagging_status === 'completed') {
        //     // No tags but tagging was completed
        //     const noTags = document.createElement('div');
        //     noTags.className = 'timeline-tooltip-no-tags';
        //     noTags.textContent = 'No tags generated';
        //     tooltip.appendChild(noTags);
        // } else if (annotation.tagging_status === 'processing') {
        //     // Still processing tags
        //     const processingTags = document.createElement('div');
        //     processingTags.className = 'timeline-tooltip-no-tags';
        //     processingTags.textContent = 'Generating tags...';
        //     tooltip.appendChild(processingTags);
        // }

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
        // Trigger extended transcript regeneration
        await regenerateExtendedTranscript(annotationId);

    } catch (error) {
        console.error('Error saving transcription edit:', error);
        showToast('Error', 'Failed to save transcription', 'error');
    } finally {
        hideLoading();
    }
}

async function regenerateExtendedTranscript(annotationId) {
    try {
        // Call the new endpoint to trigger regeneration
        const response = await fetch(`/api/annotations/${annotationId}/regenerate-extended`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error('Failed to trigger extended transcript regeneration');
        }

        // Update UI to show processing status
        const item = document.querySelector(`.annotation-item[data-id="${annotationId}"]`);
        if (item) {
            const extendedDiv = item.querySelector('.annotation-extended');
            if (extendedDiv) {
                extendedDiv.innerHTML = '<em>Regenerating extended transcript...</em>';
            }
        }
        showToast('Extended Transcript', 'Regeneration triggered', 'info');

    } catch (error) {
        console.error('Error regenerating extended transcript:', error);
        showToast("Error", 'Failed to regenerate extended transcript', 'error');
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

// Extended Transcript Functions
function toggleExtendedTranscript(annotationId) {
    const content = document.getElementById(`extended-${annotationId}`);
    const toggle = content.previousElementSibling;
    const icon = toggle.querySelector('i');

    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        icon.classList.remove('fa-caret-up');
        icon.classList.add('fa-caret-down');
        toggle.querySelector('span').textContent = 'See Extended Transcript';
    } else {
        content.classList.add('expanded');
        icon.classList.remove('fa-caret-down');
        icon.classList.add('fa-caret-up');
        toggle.querySelector('span').textContent = 'Hide Extended Transcript';
    }
}

function updateExtendedTranscriptStatus(annotationId, status) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.extended_transcript_status = status;
        renderAnnotations();
        renderTimeline();
    }
}

function updateExtendedTranscript(annotationId, extendedTranscript) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.extended_transcript = extendedTranscript;
        annotation.extended_transcript_status = 'completed';
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

function updateJudgeDecision(annotationId, judgeDecision) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.judge_status = 'completed';
        annotation.judge_decision = judgeDecision;
        renderAnnotations();
    }
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
        annotation.tagging_status = 'completed';
        // tags may arrive as array of objects or JSON string
        if (typeof tags === 'string') {
            try { tags = JSON.parse(tags); } catch(e) { tags = []; }
        }
        annotation.tags = tags || [];
        renderAnnotations();
    }
}

function updateTaskDetectionStatus(annotationId, status) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.detected_task_status = status;
        renderAnnotations();
    }
}

function updateTaskDetected(annotationId, detectedTask, confidence) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.detected_task_status = 'completed';
        if (detectedTask && (confidence === undefined || confidence >= 0.5)) {
            annotation.detected_task = detectedTask;
        }
        renderAnnotations();
    }
}

function updateReviewStatus(annotationId, status) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.review_status = status;
        renderAnnotations();
    }
}

function updateReviewResults(annotationId, reviewResults, isSalient) {
    const annotation = state.annotations.find(a => a.id === annotationId);
    if (annotation) {
        annotation.review_status = 'completed';
        annotation.review_results = reviewResults;
        if (isSalient !== undefined) annotation.is_salient = isSalient;
        // Auto-open the review panel for this annotation
        state.showReviewPanels[annotationId] = true;
        renderAnnotations();
    }
}

// function updateTaggingStatus(annotationId, status) {
//     const annotation = state.annotations.find(a => a.id === annotationId);
//     if (annotation) {
//         annotation.tagging_status = status;
//         renderAnnotations();
//     }
// }

// function updateTags(annotationId, tags) {
//     const annotation = state.annotations.find(a => a.id === annotationId);
//     if (annotation) {
//         annotation.tags = tags;
//         annotation.tagging_status = 'completed';
//         renderAnnotations();
//     }
// }

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

    // Auto remove after 5 seconds
    const autoRemoveTimeout = setTimeout(() => {
        removeToast(toast);
    }, 5000);

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
        if (segmentTab) segmentTab.style.display = 'block';
        initializeSegmentTab();
    } else if (tabName === 'projects') {
        if (projectsTab) projectsTab.style.display = 'block';
        loadProjects();
    }
}

// ------------------ Segment tab helpers (minimal) ------------------
let _segmentTabInitialized = false;

function initializeSegmentTab() {
    if (_segmentTabInitialized) return;
    _segmentTabInitialized = true;

    // Render video list for the Segment tab
    renderSegmentVideoSelector();

    const refreshBtn = document.getElementById('refreshSegmentsBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadSegments());

    const createBtn = document.getElementById('createSegmentBtn');
    if (createBtn) createBtn.addEventListener('click', createSegment);

    const loadIntoMainBtn = document.getElementById('loadIntoMainBtn');
    if (loadIntoMainBtn) loadIntoMainBtn.addEventListener('click', () => {
        if (state.currentVideoId) {
            // open same video in the main (Elicit) player
            switchTab('annotate');
            loadVideo(state.currentVideoId).catch(() => {});
        }
    });

    // If a segment player is present, forward play/pause to keep UX consistent
    const segPlayer = document.getElementById('segmentPlayer');
    if (segPlayer) {
        segPlayer.addEventListener('ended', () => {
            // nothing for now — placeholder for future UX
        });
    }

    // Initialize the draggable two-ended slider UI
    initializeSegmentSlider();

    // Load segments for current video when tab first opened
    loadSegments();
}


// ------------------ Segment slider helpers ------------------
function initializeSegmentSlider() {
    const track = document.getElementById('segmentTrack');
    const handleStart = document.getElementById('segmentHandleStart');
    const handleEnd = document.getElementById('segmentHandleEnd');
    const rangeEl = document.getElementById('segmentRange');
    if (!track || !handleStart || !handleEnd || !rangeEl) return;

    // Utility: convert time <-> percent
    const timeToPercent = (t) => {
        const dur = (document.getElementById('segmentPlayer') || document.getElementById('videoPlayer')).duration || 1;
        return Math.max(0, Math.min(100, (t / dur) * 100));
    };
    const percentToTime = (p) => {
        const dur = (document.getElementById('segmentPlayer') || document.getElementById('videoPlayer')).duration || 1;
        return Math.max(0, Math.min(dur, (p / 100) * dur));
    };

    // Update slider UI from state
    function updateUI() {
        const dur = (document.getElementById('segmentPlayer') || document.getElementById('videoPlayer')).duration || 1;
        const s = (state.segmentStartTime != null) ? state.segmentStartTime : 0;
        const e = (state.segmentEndTime != null) ? state.segmentEndTime : dur;
        const sp = timeToPercent(s);
        const ep = timeToPercent(e);
        handleStart.style.left = `calc(${sp}% - ${handleStart.offsetWidth/2}px)`;
        handleEnd.style.left = `calc(${ep}% - ${handleEnd.offsetWidth/2}px)`;
        rangeEl.style.left = `${sp}%`;
        rangeEl.style.width = `${Math.max(0, ep - sp)}%`;
        const sdisp = document.getElementById('segmentStartDisplay');
        const edisp = document.getElementById('segmentEndDisplay');
        if (sdisp) sdisp.textContent = `Start: ${formatTime(s)}`;
        if (edisp) edisp.textContent = `End: ${formatTime(e)}`;
    }

    // Pointer/drag handling
    let activeHandle = null;
    function onPointerMove(ev) {
        if (!activeHandle) return;
        ev.preventDefault();
        const rect = track.getBoundingClientRect();
        const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        let pct = ((clientX - rect.left) / rect.width) * 100;
        pct = Math.max(0, Math.min(100, pct));
        const t = percentToTime(pct);
        if (activeHandle === 'start') {
            const maxStart = (state.segmentEndTime != null) ? state.segmentEndTime - 0.1 : (document.getElementById('segmentPlayer') || document.getElementById('videoPlayer')).duration - 0.1;
            state.segmentStartTime = Math.min(maxStart, Math.max(0, t));
        } else {
            const minEnd = (state.segmentStartTime != null) ? state.segmentStartTime + 0.1 : 0.1;
            const dur = (document.getElementById('segmentPlayer') || document.getElementById('videoPlayer')).duration || 1;
            state.segmentEndTime = Math.max(minEnd, Math.min(dur, t));
        }
        updateUI();
    }
    function onPointerUp() {
        activeHandle = null;
        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('mouseup', onPointerUp);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('touchend', onPointerUp);
    }

    handleStart.addEventListener('mousedown', (e) => { activeHandle = 'start'; document.addEventListener('mousemove', onPointerMove); document.addEventListener('mouseup', onPointerUp); });
    handleEnd.addEventListener('mousedown', (e) => { activeHandle = 'end'; document.addEventListener('mousemove', onPointerMove); document.addEventListener('mouseup', onPointerUp); });
    handleStart.addEventListener('touchstart', (e) => { activeHandle = 'start'; document.addEventListener('touchmove', onPointerMove, {passive:false}); document.addEventListener('touchend', onPointerUp); }, {passive:false});
    handleEnd.addEventListener('touchstart', (e) => { activeHandle = 'end'; document.addEventListener('touchmove', onPointerMove, {passive:false}); document.addEventListener('touchend', onPointerUp); }, {passive:false});

    // Click on track sets nearest handle
    track.addEventListener('click', (e) => {
        const rect = track.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        const sPct = timeToPercent(state.segmentStartTime || 0);
        const ePct = timeToPercent(state.segmentEndTime || (document.getElementById('segmentPlayer') || document.getElementById('videoPlayer')).duration || 1);
        const distStart = Math.abs(pct - sPct);
        const distEnd = Math.abs(pct - ePct);
        const which = (distStart <= distEnd) ? 'start' : 'end';
        activeHandle = which;
        onPointerMove(e);
        activeHandle = null;
    });

    // Keyboard accessibility: arrow keys adjust handles
    [handleStart, handleEnd].forEach(h => {
        h.addEventListener('keydown', (ev) => {
            const step = 0.5; // seconds
            if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
                ev.preventDefault();
                const sign = (ev.key === 'ArrowRight') ? 1 : -1;
                const dur = (document.getElementById('segmentPlayer') || document.getElementById('videoPlayer')).duration || 1;
                if (h === handleStart) {
                    state.segmentStartTime = Math.max(0, Math.min((state.segmentEndTime || dur) - 0.1, (state.segmentStartTime || 0) + sign * step));
                } else {
                    state.segmentEndTime = Math.max((state.segmentStartTime || 0) + 0.1, Math.min(dur, (state.segmentEndTime || dur) + sign * step));
                }
                updateUI();
            }
        });
    });

    // Expose small updater used elsewhere
    window.updateSegmentSliderUI = updateUI;

    // When segment player loads metadata, reset handles to 0 → full duration
    const segPlayer = document.getElementById('segmentPlayer');
    if (segPlayer) {
        segPlayer.addEventListener('loadedmetadata', () => {
            const dur = segPlayer.duration || 0;
            state.segmentStartTime = 0;
            state.segmentEndTime = dur;
            updateUI();
        });
    }

    // Initial render — start handle at left (0%), end handle at right (100% or known duration)
    const dur0 = (document.getElementById('segmentPlayer') || document.getElementById('videoPlayer')).duration || 0;
    if (state.segmentStartTime == null) state.segmentStartTime = 0;
    if (state.segmentEndTime == null) state.segmentEndTime = dur0 > 0 ? dur0 : 0;
    updateUI();
}

function loadVideoAndSegment(videoId, startTime) {
    // helper used by Select Video modal: load video then seek to segment start
    (async () => {
        await loadVideo(videoId);
        loadVideoSegment(startTime);
        closeVideoModal();
    })();
}

// Render the list of videos inside the Segment tab selector
function renderSegmentVideoSelector() {
    const container = document.getElementById('segmentVideoSelector');
    if (!container) return;

    if (!state.videos || state.videos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-film empty-icon"></i>
                <h3>No Video Loaded</h3>
                <p>Use "Upload to OwnCloud" then "Select Video" to add videos.</p>
            </div>
        `;
        return;
    }

    // Render a compact list (reuse same visual style as modal items)
    container.innerHTML = state.videos.map(v => `
        <div class="video-list-item" style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem;border-bottom:1px solid #eee;">
            <div style="display:flex;gap:0.75rem;align-items:center;">
                <i class="fas fa-video" style="color:#0066cc"></i>
                <div style="font-weight:500">${escapeHtml(v.filename)}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
                <button class="btn btn-small" onclick="loadSegmentPlayer(${v.id})">Open</button>
                <button class="btn btn-small" onclick="loadSegmentPlayer(${v.id}); switchTab('annotate'); loadVideo(${v.id})">Open in main</button>
            </div>
        </div>
    `).join('');
}

// Load a video into the small Segment tab player
function loadSegmentPlayer(videoId) {
    const player = document.getElementById('segmentPlayer');
    const src = document.getElementById('segmentSource');
    if (!player || !src) return;

    state.currentVideoId = videoId;
    src.src = `${API_BASE}/api/videos/${videoId}/file`;
    player.load();

    // Show player container and reset start/end to 0 → full (loadedmetadata will refine)
    const container = document.getElementById('segmentVideoPlayerContainer');
    if (container) container.style.display = 'block';
    state.segmentStartTime = 0;
    state.segmentEndTime = 0;
    if (window.updateSegmentSliderUI) window.updateSegmentSliderUI();

    // Refresh segments list for the loaded video
    loadSegments();
}

async function loadSegments() {
    const list = document.getElementById('segmentsList');
    if (!list) return;

    list.innerHTML = '<div class="empty-state"><p>Loading segments…</p></div>';

    if (!state.currentVideoId) {
        list.innerHTML = '<div class="empty-state"><p>Load a video first to see segments.</p></div>';
        return;
    }

    try {
        const resp = await fetch(`${API_BASE}/api/segments/video/${state.currentVideoId}`);
        if (!resp.ok) throw new Error('Failed to load segments');
        const segments = await resp.json();
        state.segments = segments || [];
        renderSegments();
        refreshSegmentSelector();
    } catch (err) {
        console.error('Failed to load segments', err);
        list.innerHTML = '<div class="empty-state"><p>Failed to load segments</p></div>';
    }
}

function renderSegments() {
    const list = document.getElementById('segmentsList');
    if (!list) return;

    if (!state.segments || state.segments.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>No segments for this video</p></div>';
        return;
    }

    list.innerHTML = '';
    state.segments.forEach(seg => {
        const item = document.createElement('div');
        item.className = 'segment-item';
        item.innerHTML = `
            <div class="segment-meta">
                <strong>${seg.name || `Segment ${seg.id}`}</strong>
                <div class="segment-times">${formatTime(seg.start_time)} → ${formatTime(seg.end_time)}</div>
            </div>
            <div class="segment-actions">
                <button class="btn btn-small btn-icon" data-start="${seg.start_time}" onclick="loadVideoSegment(${seg.start_time})"><i class="fas fa-play"></i> Load</button>
                <button class="btn btn-small" onclick="editSegment(${seg.id})">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteSegment(${seg.id})"><i class="fas fa-trash"></i></button>
            </div>
        `;
        list.appendChild(item);
    });
}

function loadVideoSegment(startTime) {
    // Switch to annotate tab and seek — do NOT autoplay, let the user decide when to start
    switchTab('annotate');
    const videoPlayer = document.getElementById('videoPlayer');
    if (videoPlayer && !isNaN(startTime)) {
        videoPlayer.pause();
        videoPlayer.currentTime = Math.max(0, startTime);
    }
}

function setSegmentStart() {
    const segPlayer = document.getElementById('segmentPlayer');
    const videoPlayer = (segPlayer && segPlayer.readyState > 0) ? segPlayer : document.getElementById('videoPlayer');
    if (!videoPlayer || isNaN(videoPlayer.currentTime)) return;
    state.segmentStartTime = videoPlayer.currentTime;
    const disp = document.getElementById('segmentStartDisplay');
    if (disp) disp.textContent = `Start: ${formatTime(state.segmentStartTime)}`;
    if (window.updateSegmentSliderUI) window.updateSegmentSliderUI();
}

function setSegmentEnd() {
    const segPlayer = document.getElementById('segmentPlayer');
    const videoPlayer = (segPlayer && segPlayer.readyState > 0) ? segPlayer : document.getElementById('videoPlayer');
    if (!videoPlayer || isNaN(videoPlayer.currentTime)) return;
    state.segmentEndTime = videoPlayer.currentTime;
    const disp = document.getElementById('segmentEndDisplay');
    if (disp) disp.textContent = `End: ${formatTime(state.segmentEndTime)}`;
    if (window.updateSegmentSliderUI) window.updateSegmentSliderUI();
}

async function createSegment() {
    if (!state.currentVideoId) {
        showToast('No video', 'Load a video before creating a segment', 'warning');
        return;
    }
    const start = state.segmentStartTime;
    const end = state.segmentEndTime;
    if (start == null || end == null || end <= start) {
        showToast('Invalid segment', 'Set a valid start and end time first', 'error');
        return;
    }
    try {
        const payload = { parent_video_id: state.currentVideoId, name: `Segment ${formatTime(start)}-${formatTime(end)}`, start_time: start, end_time: end };
        const resp = await fetch(`${API_BASE}/api/segments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!resp.ok) throw new Error('Create failed');
        showToast('Segment created', 'Segment saved', 'success');
        await loadSegments();
        // refresh video lists so Select-Video modal shows the new segment immediately
        await loadVideos();
    } catch (err) {
        console.error(err);
        showToast('Error', 'Failed to create segment', 'error');
    }
}

async function deleteSegment(id) {
    if (!confirm('Delete this segment?')) return;
    try {
        const resp = await fetch(`${API_BASE}/api/segments/${id}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Delete failed');
        showToast('Deleted', 'Segment deleted', 'success');
        await loadSegments();
    } catch (err) {
        console.error(err);
        showToast('Error', 'Failed to delete segment', 'error');
    }
}

async function editSegment(id) {
    const newName = prompt('Segment name:');
    if (newName === null) return;
    try {
        const resp = await fetch(`${API_BASE}/api/segments/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }) });
        if (!resp.ok) throw new Error('Update failed');
        await loadSegments();
        showToast('Updated', 'Segment name updated', 'success');
    } catch (err) {
        console.error(err);
        showToast('Error', 'Failed to update segment', 'error');
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

    const willDeleteRemote = video && video.source_type === 'webdav';
    // Trash on loaded videos = remove plugin record only. OwnCloud deletion is handled separately.
    const confirmMsg = willDeleteRemote
        ? `Remove "${name}" from the plugin?\n\nThis removes the video and all its elicitations from this tool.\nThe file on OwnCloud is NOT deleted — use the trash icon in the OwnCloud section for that.`
        : `Delete video "${name}" and ALL its elicitations? This cannot be undone.`;

    if (!confirm(confirmMsg)) {
        return;
    }

    try {
        showLoading('Removing video...');

        // Choose endpoint: WebDAV videos get force=true (local record only, OwnCloud untouched)
        const deleteUrl = willDeleteRemote
            ? `${API_BASE}/api/videos/${videoId}?force=true`
            : `${API_BASE}/api/videos/${videoId}`;

        const response = await fetch(deleteUrl, { method: 'DELETE' });

        if (!response.ok) {
            // 404 means the record is already gone (e.g. OwnCloud file was deleted first and
            // cleaned up the local record). Treat it as success so the UI stays consistent.
            if (response.status !== 404) {
                const errText = await response.text();
                throw new Error(errText || 'Failed to delete video');
            }
        }

        state.videos = state.videos.filter(v => v.id !== videoId);

        if (state.currentVideoId === videoId) {
            state.currentVideo = null;
            state.currentVideoId = null;
            try { localStorage.removeItem('currentVideoId'); } catch (e) { console.error('Failed to clear video state:', e); }
            document.getElementById('videoPlayerContainer').style.display = 'none';
            document.getElementById('recordingControls').style.display = 'none';
            document.getElementById('videoSelector').style.display = 'flex';
            document.getElementById('videoInfo').style.display = 'none';
        }

        await loadVideos();
        showToast('Removed', willDeleteRemote ? 'Plugin record removed (OwnCloud file untouched)' : 'Video and elicitations deleted', 'success');
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
            return;
        }

        // Display found videos
        renderLocalVideos(data.videos);
        document.getElementById('localVideosContainer').style.display = 'block';
        document.getElementById('localVideoCount').textContent = data.videos.length;

        showToast('Success', `Found ${data.videos.length} video(s)`, 'success');

    } catch (error) {
        console.error('Error browsing folder:', error);
        showToast('Error', error.message, 'error');
    } finally {
        hideLoading();
    }
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
window.toggleExtendedTranscript = toggleExtendedTranscript;
window.toggleReviewPanel = toggleReviewPanel;
window.toggleDimension = toggleDimension;
window.triggerTagging = triggerTagging;
window.triggerReview = triggerReview;
window.deleteTag = deleteTag;
window.startEditTask = startEditTask;
window.editElicitation = editElicitation;
window.closeEditElicitationModal = closeEditElicitationModal;
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
window.openTutorialModal = openTutorialModal;

// =============================================================================
// TUTORIAL / HELP SYSTEM
// =============================================================================

const TUTORIAL_MARKDOWN = `
# Bienvenue dans l'outil d'élicitation vidéo

Cet outil a été conçu dans le cadre du projet **ReSOuRCE** pour capturer et préserver les savoirs experts des artisans. Vous allez pouvoir commenter vos propres vidéos à la voix, et un système d'intelligence artificielle vous aidera à structurer et enrichir vos commentaires.

---

## 1. Uploader une vidéo

Vos vidéos sont stockées dans un espace personnel sécurisé appelé **OwnCloud**, hébergé par Mines Paris.

**OwnCloud, c'est quoi ?**
C'est un espace de stockage en ligne similaire à Dropbox ou Google Drive, mais hébergé sur les serveurs de l'école, garantissant la confidentialité de vos données.

**Format accepté :** MP4, MOV, AVI, WebM (jusqu'à 5 Go par fichier).

**Étapes pour uploader une vidéo :**
1. Cliquez sur **"Upload to OwnCloud"** dans la barre du haut.
2. Une fenêtre s'ouvre — cliquez sur **"Upload video to OwnCloud"**.
3. Sélectionnez votre fichier vidéo depuis votre ordinateur.
4. La barre de progression indique l'avancement. Attendez le message **"Upload complete !"** avant de fermer.

> La première fois, un dossier personnel est créé automatiquement à votre nom.

---

## 2. Sélectionner une vidéo

Une fois votre vidéo uploadée, cliquez sur **"Select Video"** dans la barre du haut.

- La fenêtre affiche vos vidéos déjà chargées dans le plugin, ainsi que les fichiers présents dans votre dossier OwnCloud.
- **Fichiers grisés** : déjà chargés, pas besoin de les recharger.
- Cliquez sur un fichier OwnCloud non grisé pour le charger dans le lecteur vidéo.
- L'icône 🗑 à droite d'un fichier OwnCloud **supprime le fichier définitivement** de votre espace OwnCloud.
- L'icône 🗑 à côté d'une vidéo chargée retire uniquement la vidéo du plugin (le fichier OwnCloud est conservé).

---

## 3. Éliciter (commenter une vidéo)

L'onglet **"Elicit"** est le cœur de l'outil.

1. Chargez une vidéo (voir étape 2).
2. Lancez la lecture et positionnez-vous sur le moment qui vous semble intéressant à commenter.
3. Appuyez sur le bouton **micro** pour commencer l'enregistrement. Le micro capture votre voix pendant que la vidéo tourne.
4. Appuyez à nouveau sur le micro pour **arrêter** l'enregistrement.

**Ce qui se passe ensuite (automatiquement) :**
- Votre commentaire vocal est **transcrit** par intelligence artificielle.
- Des **tags** sont extraits (geste, outil, matière, intention...).
- Une **tâche détectée** est identifiée (ex. : "tournassage", "émaillage"...).
- Une **revue IA** évalue la complétude de votre commentaire selon trois dimensions : *Comment faire* (HOW), *Évaluation* (EVALUATION), et *Retour d'expérience* (FEEDBACK).

Vous pouvez **éditer la transcription** et **relancer l'analyse** si vous le souhaitez.

---

## 4. Segmenter une vidéo

L'onglet **"Segment"** vous permet de découper une vidéo en segments thématiques avant de l'éliciter.

1. Dans l'onglet Segment, sélectionnez votre vidéo avec **"Open"**.
2. Utilisez les **deux poignées de la barre de timeline** pour délimiter un segment.
   - Poignée gauche (bleue) = début du segment.
   - Poignée droite (violette) = fin du segment.
3. Cliquez sur **"Create segment"** pour enregistrer.

Les segments apparaissent dans le panneau de droite. Vous pouvez les charger dans le lecteur principal pour éliciter uniquement cette portion.

---

## 5. Protection des données (RGPD)

Les données collectées dans cet outil sont utilisées **exclusivement** dans le cadre du projet de recherche **ReSOuRCE** soutenu par le gouvernement français dans le cadre du volet « Compétences et métiers d'avenir » du programme France 2030, géré par la Caisse des Dépôts, dont l'objectif est la préservation des savoirs experts dans les métiers d'art.

- **Votre identifiant** dans le système est un numéro anonyme. **Votre nom n'est pas associé à vos données** dans les exports de recherche.
- Vos données (vidéos, transcriptions, commentaires) sont hébergées sur les serveurs de **Mines Paris** et ne sont **pas transmises à des tiers**.
- Elles servent uniquement à l'évaluation de l'expérience et à la rédaction d'articles scientifiques.
- **Aucune donnée n'est commercialisée.**

Pour toute question, contactez l'équipe ReSOuRCE à Mines Paris - PSL:
- Théo Akbas - theo.akbas@minesparis.psl.eu
- Alina Glushkova - alina.glushkova@minesparis.psl.eu
`;

function openTutorialModal() {
    const modal = document.getElementById('tutorialModal');
    const body = document.getElementById('tutorialBody');
    if (!modal || !body) return;

    // Render Markdown (marked + DOMPurify)
    if (window.marked && window.DOMPurify) {
        body.innerHTML = DOMPurify.sanitize(marked.parse(TUTORIAL_MARKDOWN));
    } else {
        body.textContent = TUTORIAL_MARKDOWN;
    }

    modal.classList.add('active');

    const closeBtn = document.getElementById('closeTutorialBtn');
    if (closeBtn) {
        closeBtn.onclick = closeTutorialModal;
    }
    // Click outside to close
    modal.onclick = (e) => { if (e.target === modal) closeTutorialModal(); };
}

function closeTutorialModal() {
    const modal = document.getElementById('tutorialModal');
    if (modal) modal.classList.remove('active');
    // Remember that user has seen the tutorial
    try { localStorage.setItem('tutorialSeen', '1'); } catch (e) {}
}

/**
 * Auto-open tutorial for first-time users.
 * A newcomer is someone who has no personal OwnCloud folder yet.
 * We check this after the OwnCloud config check resolves.
 * Falls back to localStorage flag if WebDAV is not configured.
 */
async function maybeShowTutorialForNewcomer() {
    try {
        const seen = localStorage.getItem('tutorialSeen');
        if (seen) return; // Already acknowledged

        if (!_webdavApiUrl) {
            // Can't check OwnCloud — show tutorial for first visit anyway
            openTutorialModal();
            return;
        }

        // Check if user folder exists via ensureuserfolder (creates it if absent, returns {created:true} the first time)
        const resp = await fetch(`${_webdavApiUrl}?action=ensureuserfolder`);
        if (!resp.ok) { openTutorialModal(); return; }
        const data = await resp.json().catch(() => ({}));
        // If the folder was just created → newcomer
        if (data.created === true) {
            openTutorialModal();
        }
    } catch (e) {
        // Non-blocking — ignore errors silently
    }
}
