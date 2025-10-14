/**
 * Video Elicitation Annotation Tool - Frontend Application
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
    recordingTimer: null
};

// API Base URL
const API_BASE = window.location.origin;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    console.log('Initializing Video Elicitation Annotation Tool...');
    
    // Set up event listeners
    setupEventListeners();
    
    // Connect WebSocket
    connectWebSocket();
    
    // Check microphone permissions
    checkMicrophonePermission();
    
    // Load existing videos
    await loadVideos();
    
    console.log('Application initialized successfully');
}

// Event Listeners Setup
function setupEventListeners() {
    // Video selection
    document.getElementById('selectVideoBtn').addEventListener('click', () => {
        if (state.videos.length > 0) {
            showVideoModal();
        } else {
            showToast('No Videos', 'Please upload videos first', 'info');
        }
    });
    
    // Video upload
    document.getElementById('addVideosBtn').addEventListener('click', () => {
        document.getElementById('videoFileInput').click();
    });
    
    document.getElementById('videoFileInput').addEventListener('change', handleVideoUpload);
    
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
    
    // Modal
    document.getElementById('closeModalBtn').addEventListener('click', closeVideoModal);
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

// Video Upload
async function handleVideoUpload(event) {
    const files = Array.from(event.target.files);
    
    if (files.length === 0) return;
    
    showLoading(`Uploading ${files.length} video(s)...`);
    
    try {
        for (const file of files) {
            await uploadVideo(file);
        }
        
        await loadVideos();
        showToast('Upload Complete', `${files.length} video(s) uploaded successfully`, 'success');
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Upload Error', error.message, 'error');
    } finally {
        hideLoading();
        event.target.value = ''; // Reset input
    }
}

async function uploadVideo(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE}/api/videos/upload`, {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Upload failed');
    }
    
    return await response.json();
}

// Load Videos
async function loadVideos() {
    try {
        const response = await fetch(`${API_BASE}/api/videos`);
        if (!response.ok) throw new Error('Failed to load videos');
        
        state.videos = await response.json();
        
        // Don't auto-show modal, let user click "Select Video" button
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
                    ${formatFileSize(video.file_size)} • ${video.annotation_count} annotations
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
    
    // Validate recording duration (minimum 0.5 seconds)
    const duration = recordingEndTime - state.recordingStartTime;
    if (duration < 0.5) {
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
                <p>No annotations yet</p>
                <p class="hint">Start recording to create your first annotation</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    state.annotations.forEach((annotation, index) => {
        const item = document.createElement('div');
        item.className = 'annotation-item';
        item.dataset.id = annotation.id;
        
        const duration = annotation.end_time - annotation.start_time;
        const statusText = getStatusText(annotation.transcription_status);
        const statusClass = annotation.transcription_status;
        
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
        `;
        
        item.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
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
    
    // Add annotation segments
    state.annotations.forEach(annotation => {
        const segment = document.createElement('div');
        segment.className = 'timeline-segment';
        segment.dataset.id = annotation.id;
        
        if (annotation.transcription_status === 'processing') {
            segment.classList.add('processing');
        }
        
        const startPercent = (annotation.start_time / duration) * 100;
        const widthPercent = ((annotation.end_time - annotation.start_time) / duration) * 100;
        
        segment.style.left = `${startPercent}%`;
        segment.style.width = `${widthPercent}%`;
        
        // Add tooltip showing time range
        segment.title = `${formatTime(annotation.start_time)} - ${formatTime(annotation.end_time)}`;
        
        segment.addEventListener('click', (e) => {
            e.stopPropagation();
            seekToAnnotation(annotation.start_time);
        });
        
        track.appendChild(segment);
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
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, 5000);
}

// Make functions globally available
window.seekToAnnotation = seekToAnnotation;
window.deleteAnnotation = deleteAnnotation;
