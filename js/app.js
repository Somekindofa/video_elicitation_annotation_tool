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
    sortBy: 'newest'
};

// API Base URL
const API_BASE = window.location.origin;

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
    // Load task selection from localStorage (optional)
    state.task = localStorage.getItem('task') || '';
    // Create selectors UI
    createCraftSelectorUI();
    await initializeTaskSelector();

    // Reload tasks when craft changes
    const craftSelect = document.getElementById('craftSelector');
    if (craftSelect) {
        craftSelect.addEventListener('change', async () => {
            state.craft = craftSelect.value;
            try { localStorage.setItem('craft', state.craft); } catch (_) { }
            // Reload tasks for the new craft domain
            const taskSelect = document.getElementById('taskSelect');
            if (taskSelect) {
                await loadTasks(taskSelect, state.craft);
            }
        });
    }

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

// Task selector with select + add-new input
async function initializeTaskSelector() {
    const controls = document.getElementById('recordingControls');
    if (!controls) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'task-selector';
    wrapper.style.margin = '10px 0';

    const label = document.createElement('div');
    label.textContent = 'Task (choose or add)';
    label.style.fontSize = '0.9rem';
    label.style.marginBottom = '6px';

    const select = document.createElement('select');
    select.id = 'taskSelect';
    select.style.padding = '6px 8px';
    select.style.borderRadius = '4px';
    select.style.border = '1px solid #ccc';
    select.style.minWidth = '240px';

    const addInput = document.createElement('input');
    addInput.id = 'taskAddInput';
    addInput.placeholder = 'Type task name';
    addInput.style.padding = '6px 8px';
    addInput.style.borderRadius = '4px';
    addInput.style.border = '1px solid #ccc';
    addInput.style.marginLeft = '8px';
    addInput.style.minWidth = '200px';

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Task';
    addBtn.style.marginLeft = '8px';
    addBtn.style.padding = '6px 12px';
    addBtn.style.borderRadius = '4px';
    addBtn.style.border = '1px solid #ccc';
    addBtn.style.background = '#f0f0f0';
    addBtn.style.cursor = 'pointer';

    select.addEventListener('change', (e) => {
        state.task = e.target.value || '';
        try { localStorage.setItem('task', state.task); } catch (_) { }
    });

    addBtn.addEventListener('click', async () => {
        const value = addInput.value.trim();
        if (!value) return;
        try {
            await createOrSelectTask(value);
            addInput.value = '';
        } catch (err) {
            console.error('Failed to add task', err);
        }
    });

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.appendChild(select);
    row.appendChild(addInput);
    row.appendChild(addBtn);

    wrapper.appendChild(label);
    wrapper.appendChild(row);

    const existingCraft = controls.querySelector('.craft-selector');
    if (existingCraft && existingCraft.nextSibling) {
        controls.insertBefore(wrapper, existingCraft.nextSibling);
    } else {
        controls.insertBefore(wrapper, controls.firstChild);
    }

    await loadTasks(select, state.craft);
    renderTaskOptions(select);
}

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

        // case 'tagging_status':
        //     updateTaggingStatus(message.annotation_id, message.status);
        //     break;

        // case 'tagging_complete':
        //     updateTags(message.annotation_id, message.tags);
        //     if (state.currentVideoId) {
        //         loadAnnotations(state.currentVideoId);
        //     }
        //     break;

        // case 'tagging_error':
        //     showToast('Tagging Error', message.error, 'error');
        //     updateTaggingStatus(message.annotation_id, 'failed');
        //     break;

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
    // Check if File System Access API is available
    if (window.showOpenFilePicker) {
        try {
            // Use modern File System Access API to get full file paths
            const fileHandles = await window.showOpenFilePicker({
                multiple: true,
                types: [{
                    description: 'Video Files',
                    accept: {
                        'video/*': ['.mp4', '.webm', '.mov', '.avi', '.mkv']
                    }
                }]
            });

            showLoading(`Registering ${fileHandles.length} video(s)...`);

            let successCount = 0;
            let duplicateCount = 0;
            let lastRegisteredVideoId = null;

            for (const fileHandle of fileHandles) {
                try {
                    const file = await fileHandle.getFile();

                    // Try to get the full path - this may not work in all browsers
                    // In Electron or when using file:// protocol, we might have access
                    let filepath = null;

                    // Try different methods to get the file path
                    if (file.path) {
                        filepath = file.path;
                    } else if (fileHandle.name && window.location.protocol === 'file:') {
                        // Running locally, might have access to path
                        filepath = fileHandle.name;
                    }

                    if (!filepath) {
                        // Fallback: ask user to provide the full path
                        filepath = prompt(
                            `Please enter the full path for "${file.name}":\n\n` +
                            `(Example: C:\\Videos\\${file.name})`,
                            `C:\\Videos\\${file.name}`
                        );

                        if (!filepath) {
                            console.log(`Skipped ${file.name} - no path provided`);
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
                        console.error(`Failed to register video:`, error);
                        showToast('Registration Error', error.message, 'error');
                    }
                }
            }

            // Reload video list
            await loadVideos();

            // Show summary message
            if (successCount > 0) {
                const message = duplicateCount > 0
                    ? `${successCount} video(s) registered, ${duplicateCount} already existed`
                    : `${successCount} video(s) registered successfully`;
                showToast('Registration Complete', message, 'success');

                // Auto-load the last registered video if only one was added
                if (successCount === 1 && lastRegisteredVideoId) {
                    await loadVideo(lastRegisteredVideoId);
                }
            } else if (duplicateCount > 0) {
                showToast('Already Registered', `All video(s) were already in your library`, 'info');
            }

            hideLoading();

        } catch (error) {
            hideLoading();

            if (error.name === 'AbortError') {
                // User cancelled the file picker
                console.log('File selection cancelled');
            } else {
                console.error('Error selecting files:', error);
                showToast('Error', 'Failed to select files: ' + error.message, 'error');
            }
        }
    } else {
        // Fallback: use traditional file input (won't have full paths)
        // Show a warning and fall back to the old folder browser
        showToast(
            'Browser Limitation',
            'Your browser doesn\'t support direct file selection. Please enter a folder path manually.',
            'warning'
        );

        // Prompt for folder path
        const folderPath = prompt(
            'Enter the full path to a folder containing videos:\n\n' +
            '(Example: C:\\Users\\YourName\\Videos\\)',
            ''
        );

        if (folderPath) {
            await handleBrowseFolder(folderPath);
        }
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
        let lastRegisteredVideoId = null;

        for (const file of files) {
            try {
                // Use the file's full path for registration
                const filepath = file.path || file.webkitRelativePath || file.name;
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
            const message = duplicateCount > 0
                ? `${successCount} video(s) registered, ${duplicateCount} already existed`
                : `${successCount} video(s) registered successfully`;
            showToast('Registration Complete', message, 'success');

            // Auto-load the last registered video if only one was added
            if (successCount === 1 && lastRegisteredVideoId) {
                await loadVideo(lastRegisteredVideoId);
            }
        } else if (duplicateCount > 0) {
            showToast('Already Registered', `All ${duplicateCount} video(s) were already in your library`, 'info');
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
function showVideoModal() {
    const modal = document.getElementById('videoListModal');
    const container = document.getElementById('videoListContainer');

    container.innerHTML = '';

    if (state.videos.length === 0) {
        container.innerHTML = '<p class="empty-state">No videos available</p>';
    } else {
        state.videos.forEach(video => {
            const item = document.createElement('div');
            item.className = 'video-list-item';
            if (state.currentVideoId === video.id) {
                item.classList.add('active');
            }

            item.innerHTML = `
                <div class="video-list-name">${video.filename}</div>
                <div class="video-list-meta">
                    ${formatFileSize(video.file_size)} • ${video.annotation_count} elicitations
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

        // Extended transcript UI logic
        let extendedTranscriptHTML = '';
        if (annotation.transcription && annotation.transcription_status === 'completed') {
            if (annotation.extended_transcript_status === 'processing') {
                extendedTranscriptHTML = `
                    <div class="extended-transcript-progress">
                        <i class="fa-solid fa-hammer"></i>
                        <span class="ellipsis">
                            <span></span>
                            <span></span>
                            <span></span>
                        </span>
                    </div>
                `;
            } else if (annotation.extended_transcript_status === 'completed' && annotation.extended_transcript) {
                const feedbackClass = annotation.feedback !== null ?
                    (annotation.feedback === 1 ? 'thumbs-up' : 'thumbs-down') : '';
                const extendedHtml = mdToHtml(annotation.extended_transcript);
                extendedTranscriptHTML = `
                    <div class="extended-transcript-container">
                        <div class="extended-transcript-toggle" onclick="toggleExtendedTranscript(${annotation.id})">
                            <i class="fa-solid fa-caret-down"></i>
                            <span>See Extended Transcript</span>
                        </div>
                        <div class="extended-transcript-content" id="extended-${annotation.id}">
                            <div class="md">${extendedHtml}</div>
                            <div class="feedback-buttons">
                                <button class="feedback-btn thumbs-up ${annotation.feedback === 1 ? 'active' : ''}" 
                                    onclick="handleFeedback(${annotation.id}, 1, event)">
                                    <i class="fa-solid fa-thumbs-up"></i>
                                    <span>Utile</span>
                                </button>
                                <button class="feedback-btn thumbs-down ${annotation.feedback === 0 ? 'active' : ''}" 
                                    onclick="handleFeedback(${annotation.id}, 0, event)">
                                    <i class="fa-solid fa-thumbs-down"></i>
                                    <span>Pas utile</span>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // Tags UI logic
        let tagsHTML = '';
        if (annotation.extended_transcript_status === 'completed') {
            if (annotation.tagging_status === 'processing') {
                tagsHTML = `
                    <div class="tagging-progress">
                        <i class="fa-solid fa-tag"></i>
                        <span>Generating tags...</span>
                    </div>
                `;
            } else if (annotation.tagging_status === 'completed' && annotation.tags && annotation.tags.length > 0) {
                tagsHTML = `<div class="annotation-tags">`;

                annotation.tags.forEach(tag => {
                    const categoryClass = tag.category ? `category-${tag.category}` : '';
                    tagsHTML += `
                        <span class="annotation-tag ${categoryClass}" title="${tag.category || 'tag'}">
                            ${tag.name}
                        </span>
                    `;
                });

                tagsHTML += `</div>`;
            }
        }

        item.innerHTML = `
            <div class="annotation-header">
                <span class="annotation-time">
                    ${formatTime(annotation.start_time)} - ${formatTime(annotation.end_time)}
                    (${duration.toFixed(1)}s)
                </span>
                <div class="annotation-actions">
                    <button class="btn btn-icon btn-small" onclick="seekToAnnotation(${annotation.start_time})" title="Jump to time">
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
            <div class="annotation-status ${statusClass}">
                ${statusText}
            </div>
            ${tagsHTML}
            ${extendedTranscriptHTML}
        `;

        item.addEventListener('click', (e) => {
            if (!e.target.closest('button') && !e.target.closest('.extended-transcript-toggle') && !e.target.closest('.feedback-btn')) {
                seekToAnnotation(annotation.start_time);
            }
        });

        container.appendChild(item);
    });
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
    const projectsTab = document.getElementById('projectsTab');

    // Hide all tabs first (with null checks)
    if (annotateTab) annotateTab.style.display = 'none';
    if (projectsTab) projectsTab.style.display = 'none';

    if (tabName === 'annotate') {
        if (annotateTab) annotateTab.style.display = '';
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
window.registerLocalVideo = registerLocalVideo;
window.handleFeedback = handleFeedback;
window.openProject = openProject;
window.editProject = editProject;
window.deleteProject = deleteProject;
window.assignVideos = assignVideos;
window.addVideoToProject = addVideoToProject;
window.removeVideoFromProject = removeVideoFromProject;
window.deleteVideo = deleteVideo;
