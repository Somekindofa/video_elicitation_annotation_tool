/**
 * Video Elicitation Tool - Frontend Application
 * Main JavaScript file handling all client-side functionality
 */

// ─────────────────────────────────────────────────────────────
// Internationalisation (i18n)
// ─────────────────────────────────────────────────────────────
const TRANSLATIONS = {
    en: {
        // Header / nav
        backToMoodle: 'Back to Moodle',
        headerSubtitle: 'ReSource Project - Expert Knowledge Capture',
        uploadVideo: 'Upload Video',
        selectVideo: 'Select Video',
        tabElicit: 'Elicit',
        tabSegment: 'Segment',
        tabProjects: 'Projects',

        // Empty states
        noVideoLoaded: 'No Video Loaded',
        noVideoHint: 'Click "Upload Video" then "Select Video" to get started',
        segmentNoVideoHint: 'Open a video from the selector to view or create segments',
        noAnnotationsYet: 'No annotations yet',
        noAnnotationsHint: 'Start recording to create your first elicitation',
        noSegmentsYet: 'No segments yet',
        noProjectsYet: 'No Projects Yet',
        noProjectsHint: 'Create a project to organize your videos for batch elicitation',

        // Recording controls
        skipBack10: 'Skip back 10 seconds',
        skipForward10: 'Skip forward 10 seconds',
        startRecording: 'Start Recording',
        statusReady: 'Ready',
        browserNoVideo: 'Your browser does not support the video tag.',

        // Video info bar
        videoLabel: 'Video:',
        elicitationsLabel: 'Elicitations:',
        exportAnnotations: 'Export Annotations',

        // Annotations panel
        panelElicitations: 'Elicitations',
        sort: 'Sort',
        refresh: 'Refresh',
        sortTimelyAsc: 'Timely (Asc)',
        sortTimelyDesc: 'Timely (Desc)',
        sortNewest: 'Newest',

        // Segment panel
        panelSegments: 'Segments',
        segmentStart: 'Segment start',
        segmentEnd: 'Segment end',
        segmentStartPrefix: 'Start',
        segmentEndPrefix: 'End',
        createSegment: 'Create segment',
        openInMainPlayer: 'Open in main player',

        // Projects panel
        newProject: 'New Project',

        // Video list modal
        modalSelectVideo: 'Select Video',
        loadingFiles: 'Loading files...',

        // Project modal
        createProject: 'Create Project',
        editProject: 'Edit Project',
        projectNameLabel: 'Project Name *',
        projectNamePlaceholder: 'Enter project name',
        projectDescLabel: 'Description',
        projectDescPlaceholder: 'Optional description',
        saveProject: 'Save Project',

        // Assign videos modal
        assignVideosTo: 'Assign Videos to',
        availableVideos: 'Available Videos',
        videosInProject: 'Videos in Project (Drag to reorder)',

        // Local folder modal
        browseLocalFolder: 'Browse Local Video Folder',
        folderPathLabel: 'Folder Path *',
        folderPathHint: 'Enter the absolute path to your video folder (Windows: C:\\path\\to\\folder, Linux/Mac: /path/to/folder)',
        browseFolder: 'Browse Folder',
        foundVideos: 'Found Videos',

        // Shared buttons
        cancel: 'Cancel',
        close: 'Close',
        save: 'Save',

        // Loading / processing
        processing: 'Processing...',
        loadingEllipsis: 'Loading...',

        // Tutorial
        guideTitle: 'Usage Guide',

        // Dynamic JS strings (recording status)
        statusRecording: 'Recording...',
        statusReadyToRecord: 'Ready to Record',
        statusProcessing: 'Processing...',

        // Elicit controls
        craftDomainLabel: 'Select your craft domain',
        segmentSelectorLabel: 'Select segment',
        segmentSelectorPlaceholder: '— choose a segment —',

        // Craft names
        craft_glassblowing: 'Glassblowing',
        craft_scientific_glassblowing: 'Scientific Glassblowing',
        craft_jewelry: 'Jewelry',
        craft_glovemaking: 'Glovemaking',
        craft_saddlery: 'Upholstery',

        // Annotation card dynamic text
        jumpToTime: 'Jump to time',
        editTranscription: 'Edit transcription',
        deleteAnnotation: 'Delete',
        markComplete: 'Mark as complete',
        relaunchTagging: 'Relaunch tagging',
        relaunchReview: 'Relaunch AI Review',
        modifyElicitation: 'Modify elicitation',
        recordAnswer: 'Record an answer',

        // Video list items
        removeFromPlugin: 'Remove from plugin',
        renameVideo: 'Rename',
        renameVideoPrompt: 'Enter a new name for this video (leave blank to clear):',
        renameSuccess: 'Video renamed',
        renameFailed: 'Failed to rename video',

        // Segment cards
        deleteSegment: 'Delete segment',
        previewSegment: 'Click to preview this segment',

        // Transcription status
        transcriptionPending: 'Transcription pending...',
        transcribingAudio: 'Transcribing audio...',
        transcriptionComplete: 'Transcription complete',
        transcriptionFailed: 'Transcription failed',

        // Toast titles
        toastError: 'Error',
        toastSuccess: 'Success',
        toastWarning: 'Warning',

        // Inline recording / guided QA
        answerByVoice: 'Answer by voice',
        stopRecording: 'Stop recording',
        transcribingInProgress: 'Transcribing...',
        replaySegment: 'Replay the segment',
        replaySegmentFor: 'Replay segment to recall',

        // No video in list
        noVideosLoaded: 'No videos loaded yet. Click a video below to load it.',
        noSegmentsForVideo: 'No segments for this video',
        loadVideoFirst: 'Load a video first to see segments.',

        // Coverage banner / session summary
        coveragePhaseExampleQuoi: 'E.g. "I take the clamp, I turn the glass to the left."',
        coveragePhaseExampleComment: 'E.g. "slowly, first to the right then to the left, with the long clamp."',
        coveragePhaseExamplePourquoi: 'E.g. "because otherwise the bubble collapses, to avoid streaks."',
        coverageFinishSession: 'Analyze my session',
        coverageRecordingActive: 'Recording in progress…',
        sessionSummaryTitle: 'Session summary',
        sessionSummaryCloseAria: 'Close',
        coverageFollowUpsLabel: 'To go further',
        coverageSessionComplete: 'Session complete',
        coverageSummarizing: 'Summarizing…',

        // Per-annotation coverage panel
        coverageAnalyzing: 'Analyzing…',
        coverageStatusAbsent: 'Absent',
        coverageStatusPartial: 'Partial',
        coverageStatusCovered: 'Covered',
        coverageHintQuoi: 'Add a concrete action ("I take…", "I turn…").',
        coverageHintComment: 'Specify the manner (speed, tool, sequence: "slowly, first…").',
        coverageHintPourquoi: 'Explain the reason ("because…", "to avoid…").',
        coverageTranscriptLabel: 'Transcription (markers highlighted):',
        coverageActionsHint: 'Need to say more about this moment? The add-on is appended to the existing transcription.',
        coverageAppendRecord: 'Add to transcription',
        coverageAppendStop: 'Stop and append',
        coverageAppendTitle: 'Record a top-up clip and append it to the existing transcription.',
        coverageRetranscribe: 'Re-transcribe',
        coverageRetranscribeTitle: 'Re-run Whisper on the existing audio. The current transcription will be replaced.',
        coverageRetranscribeConfirm: 'Re-run the transcription for this recording?\n\nThe current transcription will be replaced.',

        // Custom craft domain UI
        addCraftPlaceholder: 'New domain name',
        addCraftConfirm: 'Add',
        addCraftTitle: 'Add custom domain',
        addCraftEmpty: 'Enter a name',
        addCraftTooLong: 'Max 100 characters',
        addCraftInvalid: 'Invalid name (use letters and numbers)',
        addCraftDuplicate: 'This domain already exists',
        addCraftError: 'Could not save, please try again',
    },
    fr: {
        // Header / nav
        backToMoodle: 'Vers Moodle',
        headerSubtitle: 'Projet ReSource - Capture de savoirs experts',
        uploadVideo: 'Déposer une vidéo',
        selectVideo: 'Choisir une vidéo',
        tabElicit: 'Éliciter',
        tabSegment: 'Segmenter',
        tabProjects: 'Projets',

        // Empty states
        noVideoLoaded: 'Aucune vidéo chargée',
        noVideoHint: 'Cliquez sur "Déposer une vidéo" puis "Choisir une vidéo" pour démarrer',
        segmentNoVideoHint: 'Ouvrez une vidéo depuis le sélecteur pour voir ou créer des segments',
        noAnnotationsYet: 'Aucune annotation pour l\'instant',
        noAnnotationsHint: 'Commencez un enregistrement pour créer votre première élicitation',
        noSegmentsYet: 'Aucun segment pour l\'instant',
        noProjectsYet: 'Aucun projet pour l\'instant',
        noProjectsHint: 'Créez un projet pour organiser vos vidéos en élicitation par lots',

        // Recording controls
        skipBack10: 'Reculer de 10 secondes',
        skipForward10: 'Avancer de 10 secondes',
        startRecording: 'Démarrer l\'enregistrement',
        statusReady: 'Prêt',
        browserNoVideo: 'Votre navigateur ne supporte pas la lecture vidéo.',

        // Video info bar
        videoLabel: 'Vidéo :',
        elicitationsLabel: 'Élicitations :',
        exportAnnotations: 'Exporter les annotations',

        // Annotations panel
        panelElicitations: 'Élicitations',
        sort: 'Trier',
        refresh: 'Rafraîchir',
        sortTimelyAsc: 'Chronologique (croissant)',
        sortTimelyDesc: 'Chronologique (décroissant)',
        sortNewest: 'Plus récent',

        // Segment panel
        panelSegments: 'Segments',
        segmentStart: 'Début du segment',
        segmentEnd: 'Fin du segment',
        segmentStartPrefix: 'Début',
        segmentEndPrefix: 'Fin',
        createSegment: 'Créer un segment',
        openInMainPlayer: 'Ouvrir dans le lecteur principal',

        // Projects panel
        newProject: 'Nouveau projet',

        // Video list modal
        modalSelectVideo: 'Choisir une vidéo',
        loadingFiles: 'Chargement des fichiers...',

        // Project modal
        createProject: 'Créer un projet',
        editProject: 'Modifier le projet',
        projectNameLabel: 'Nom du projet *',
        projectNamePlaceholder: 'Saisir le nom du projet',
        projectDescLabel: 'Description',
        projectDescPlaceholder: 'Description optionnelle',
        saveProject: 'Enregistrer le projet',

        // Assign videos modal
        assignVideosTo: 'Assigner des vidéos à',
        availableVideos: 'Vidéos disponibles',
        videosInProject: 'Vidéos du projet (glisser pour réordonner)',

        // Local folder modal
        browseLocalFolder: 'Parcourir le dossier vidéo local',
        folderPathLabel: 'Chemin du dossier *',
        folderPathHint: 'Entrez le chemin absolu vers votre dossier vidéo (Windows : C:\\chemin\\vers\\dossier, Linux/Mac : /chemin/vers/dossier)',
        browseFolder: 'Parcourir',
        foundVideos: 'Vidéos trouvées',

        // Shared buttons
        cancel: 'Annuler',
        close: 'Fermer',
        save: 'Enregistrer',

        // Loading / processing
        processing: 'Traitement en cours...',
        loadingEllipsis: 'Chargement...',

        // Tutorial
        guideTitle: 'Guide d\'utilisation',

        // Dynamic JS strings (recording status)
        statusRecording: 'Enregistrement…',
        statusReadyToRecord: 'Prêt à enregistrer',
        statusProcessing: 'Traitement…',

        // Elicit controls
        craftDomainLabel: 'Sélectionnez votre domaine artisanal',
        segmentSelectorLabel: 'Choisir un segment',
        segmentSelectorPlaceholder: '— choisir un segment —',

        // Craft names
        craft_glassblowing: 'Soufflage de verre',
        craft_scientific_glassblowing: 'Verrerie scientifique',
        craft_jewelry: 'Joaillerie',
        craft_glovemaking: 'Ganterie',
        craft_saddlery: 'Scellerie',

        // Annotation card dynamic text
        jumpToTime: 'Aller au moment',
        editTranscription: 'Modifier la transcription',
        deleteAnnotation: 'Supprimer',
        markComplete: 'Marquer comme complet',
        relaunchTagging: 'Relancer le balisage',
        relaunchReview: 'Relancer la revue IA',
        modifyElicitation: 'Modifier l\'élicitation',
        recordAnswer: 'Enregistrer une réponse',

        // Video list items
        removeFromPlugin: 'Retirer du plugin',
        renameVideo: 'Renommer',
        renameVideoPrompt: 'Entrez un nouveau nom pour cette vidéo (laissez vide pour effacer) :',
        renameSuccess: 'Vidéo renommée',
        renameFailed: 'Échec du renommage de la vidéo',

        // Segment cards
        deleteSegment: 'Supprimer le segment',
        previewSegment: 'Cliquer pour prévisualiser ce segment',

        // Transcription status
        transcriptionPending: 'Transcription en attente…',
        transcribingAudio: 'Transcription en cours…',
        transcriptionComplete: 'Transcription terminée',
        transcriptionFailed: 'Échec de la transcription',

        // Toast titles
        toastError: 'Erreur',
        toastSuccess: 'Succès',
        toastWarning: 'Avertissement',

        // Inline recording / guided QA
        answerByVoice: 'Répondre par la voix',
        stopRecording: 'Arrêter l\'enregistrement',
        transcribingInProgress: 'Transcription…',
        replaySegment: 'Rejouer le segment',
        replaySegmentFor: 'Rejouer le segment pour vous remémorer',

        // No video in list
        noVideosLoaded: 'Aucune vidéo chargée. Cliquez sur une vidéo ci-dessous pour la charger.',
        noSegmentsForVideo: 'Aucun segment pour cette vidéo',
        loadVideoFirst: 'Chargez d\'abord une vidéo pour voir les segments.',

        // Coverage banner / session summary
        coveragePhaseExampleQuoi: 'Ex. « Je prends la pince, je tourne le verre à gauche. »',
        coveragePhaseExampleComment: 'Ex. « lentement, d\'abord à droite puis à gauche, avec la pince longue. »',
        coveragePhaseExamplePourquoi: 'Ex. « parce que sinon la bulle s\'effondre, c\'est pour éviter les stries. »',
        coverageFinishSession: 'Analyser ma session',
        coverageRecordingActive: 'Enregistrement en cours…',
        sessionSummaryTitle: 'Synthèse de la session',
        sessionSummaryCloseAria: 'Fermer',
        coverageFollowUpsLabel: 'Pour aller plus loin',
        coverageSessionComplete: 'Session complète',
        coverageSummarizing: 'Synthèse…',

        // Per-annotation coverage panel
        coverageAnalyzing: 'Analyse en cours…',
        coverageStatusAbsent: 'Absent',
        coverageStatusPartial: 'Partiel',
        coverageStatusCovered: 'Couvert',
        coverageHintQuoi: 'Ajoute une action concrète (« je prends… », « je tourne… »).',
        coverageHintComment: 'Précise la manière (vitesse, outil, séquence : « lentement, d\'abord… »).',
        coverageHintPourquoi: 'Explique la raison (« parce que… », « pour éviter… »).',
        coverageTranscriptLabel: 'Transcription (marqueurs surlignés) :',
        coverageActionsHint: 'Besoin d\'en dire plus sur ce moment ? Le complément s\'ajoute à la transcription existante.',
        coverageAppendRecord: 'Ajouter à la transcription',
        coverageAppendStop: 'Arrêter et ajouter',
        coverageAppendTitle: 'Enregistre un complément audio et l\'ajoute à la transcription existante.',
        coverageRetranscribe: 'Re-transcrire',
        coverageRetranscribeTitle: 'Relance Whisper sur l\'audio existant. La transcription sera remplacée.',
        coverageRetranscribeConfirm: 'Relancer la transcription de cet enregistrement ?\n\nLa transcription actuelle sera remplacée.',

        // Custom craft domain UI
        addCraftPlaceholder: 'Nouveau domaine',
        addCraftConfirm: 'Ajouter',
        addCraftTitle: 'Ajouter un domaine personnalisé',
        addCraftEmpty: 'Saisissez un nom',
        addCraftTooLong: 'Maximum 100 caractères',
        addCraftInvalid: 'Nom invalide (lettres et chiffres uniquement)',
        addCraftDuplicate: 'Ce domaine existe déjà',
        addCraftError: 'Impossible de sauvegarder, réessayez',
    },
};

// Current language – persisted across page reloads
let currentLang = (() => {
    try { return localStorage.getItem('appLang') || 'en'; } catch (e) { return 'en'; }
})();

/**
 * Returns the translated string for `key` in the current language.
 * Falls back to English, then to the raw key.
 */
function t(key) {
    return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) ||
           (TRANSLATIONS.en && TRANSLATIONS.en[key]) ||
           key;
}

/**
 * Apply translations to all elements that carry a data-i18n* attribute,
 * and update the lang toggle button.
 */
function applyLanguage() {
    // Text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });

    // title attributes
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = t(key);
    });

    // placeholder attributes
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });

    // aria-label attributes
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria-label');
        el.setAttribute('aria-label', t(key));
    });

    // Update <html lang>
    document.documentElement.lang = currentLang;

    // Update lang toggle button
    const langFlag = document.getElementById('langFlag');
    const langLabel = document.getElementById('langLabel');
    if (langFlag) langFlag.textContent = currentLang === 'fr' ? '🇫🇷' : '🇬🇧';
    if (langLabel) langLabel.textContent = currentLang === 'fr' ? 'FR' : 'EN';

    // Refresh dynamic UI areas that build their own HTML
    // (these functions read t() at build time so they just need to be re-called)
    refreshDynamicUIStrings();
}

/**
 * Refresh UI areas whose content is generated by JS functions.
 * Called after a language switch.
 */
function refreshDynamicUIStrings() {
    // Recording status indicator (if not actively recording)
    if (!state.isRecording) {
        const statusTextEl = document.getElementById('statusText');
        if (statusTextEl && (
            statusTextEl.textContent === TRANSLATIONS.en.statusReady ||
            statusTextEl.textContent === TRANSLATIONS.fr.statusReady ||
            statusTextEl.textContent === 'Ready'
        )) {
            statusTextEl.textContent = t('statusReady');
        }
    }

    // Elicit controls (craft label + segment selector placeholder)
    const craftLabelEl = document.querySelector('.elicit-controls label[for="craftSelector"]');
    if (craftLabelEl) {
        craftLabelEl.textContent = t('craftDomainLabel');
    }
    // Update craft option labels for current language
    const craftSelector = document.getElementById('craftSelector');
    if (craftSelector) {
        Array.from(craftSelector.options).forEach(opt => {
            const key = opt.getAttribute('data-craft-key');
            if (key) opt.textContent = t(key);
        });
    }
    const segLabelEl = document.querySelector('#segmentSelectorWrapper label[for="segmentSelector"]');
    if (segLabelEl) segLabelEl.textContent = t('segmentSelectorLabel');
    const segPlaceholder = document.querySelector('#segmentSelector option[disabled]');
    if (segPlaceholder) segPlaceholder.textContent = t('segmentSelectorPlaceholder');

    // Empty-state messages injected by resetInterface() / loadAnnotations()
    // Rebuild them only when appropriate
    if (!state.currentVideoId) {
        const videoSelector = document.getElementById('videoSelector');
        if (videoSelector && videoSelector.querySelector('.empty-state')) {
            videoSelector.querySelector('.empty-state h3').textContent = t('noVideoLoaded');
            videoSelector.querySelector('.empty-state p').textContent = t('noVideoHint');
        }
    }

    const annotsList = document.getElementById('annotationsList');
    if (annotsList && annotsList.querySelector('.empty-state')) {
        const p1 = annotsList.querySelector('.empty-state p:first-of-type');
        const p2 = annotsList.querySelector('.empty-state p.hint');
        if (p1) p1.textContent = t('noAnnotationsYet');
        if (p2) p2.textContent = t('noAnnotationsHint');
    }

    // Segment start/end display (prefix only)
    refreshSegmentDisplayPrefixes();

    // Re-render the elicitation panel — annotation cards and coverage panels
    // bake t() into their HTML at build time, so a language switch needs a
    // re-render. Only UI strings are replaced; transcriptions are not.
    if (typeof renderAnnotations === 'function' && Array.isArray(state.annotations)) {
        try { renderAnnotations(); } catch (_) { /* early init */ }
        try { renderAnnotationPips(); } catch (_) { /* early init */ }
    }
    if (typeof renderCoverageBanner === 'function') {
        try { renderCoverageBanner(); } catch (_) { /* early init */ }
    }
    // If a session summary is currently displayed, its inner labels are
    // baked from t() — regenerate them from the cached last response.
    if (state.coverage && state.coverage.summaryOpen && state.coverage.lastSummary) {
        try { renderSessionSummary(state.coverage.lastSummary); } catch (_) {}
    }
}

/** Keep "Start: X" / "End: X" labels translated when the user switches language. */
function refreshSegmentDisplayPrefixes() {
    const startEl = document.getElementById('segmentStartDisplay');
    const endEl   = document.getElementById('segmentEndDisplay');
    if (startEl) {
        const raw = startEl.textContent;
        const colonIdx = raw.indexOf(':');
        const timeStr = colonIdx !== -1 ? raw.slice(colonIdx) : ': -';
        startEl.textContent = t('segmentStartPrefix') + timeStr;
    }
    if (endEl) {
        const raw = endEl.textContent;
        const colonIdx = raw.indexOf(':');
        const timeStr = colonIdx !== -1 ? raw.slice(colonIdx) : ': -';
        endEl.textContent = t('segmentEndPrefix') + timeStr;
    }
}

/** Toggle between EN and FR */
function toggleLanguage() {
    currentLang = currentLang === 'en' ? 'fr' : 'en';
    try { localStorage.setItem('appLang', currentLang); } catch (e) {}
    applyLanguage();
}

// ─────────────────────────────────────────────────────────────
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
    // Segment-specific state
    segmentStartTime: null,
    segmentEndTime: null,
    segments: [],
    // Tracks which annotation review panels are open { [annotationId]: boolean }
    showReviewPanels: {},
    // Guided Q&A voice enrichment session
    guidedQA: {
        annotationId: null,
        questions: [],          // array of strings (priority_prompts)
        currentIndex: 0,
        originalTranscript: '',
        updatedTranscript: '',  // accumulates appended answer transcriptions
        isRecording: false,
        mediaRecorder: null,
        audioChunks: [],
        loopInterval: null,
    },
    // Append-to-transcript recording (per-annotation top-up).
    appendMode: {
        annotationId: null,
        mediaRecorder: null,
        chunks: [],
        stream: null,
    },
    // RAG knowledge silo awareness
    managedCohorts: [],       // {cohort_id, cohort_name}[] from /api/cohorts/managed
    siloContactEmail: null,   // from JWT payload.silo_contact_email
};

// API Base URL and JWT token from iframe query
const TOKEN_PARAM = new URLSearchParams(window.location.search).get('token');
const MOODLE_JWT = TOKEN_PARAM || '';

// Decode JWT payload (lightweight) so we can access `userid`
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
state.siloContactEmail = _JWT_PAYLOAD.silo_contact_email || null;

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
            <h3>${t('noVideoLoaded')}</h3>
            <p>${t('noVideoHint')}</p>
        </div>
    `;

    // Clear annotations panel
    const annotationsList = document.getElementById('annotationsList');
    annotationsList.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-pen-to-square empty-icon"></i>
            <p>${t('noAnnotationsYet')}</p>
            <p class="hint">${t('noAnnotationsHint')}</p>
        </div>
    `;

    // Pause and reset video player
    const videoPlayer = document.getElementById('videoPlayer');
    const videoSource = document.getElementById('videoSource');
    videoPlayer.pause();
    videoPlayer.currentTime = 0;
    videoSource.src = '';
    videoPlayer.load(); // Important: reload to clear the source properly

    // Reset coverage state and hide the banner + summary modal
    state.coverage = { scores: {}, aggregate: null, plateau: false, summaryOpen: false };
    renderCoverageBanner();
    hideSessionSummary();

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

    // "Back to Moodle" button: navigate the top-level window, not just the iframe.
    // Without this, clicking the link updates the iframe's URL but leaves the parent
    // page's address bar stuck on /local/videoelicit/index.php.
    const backBtn = document.getElementById('backToMoodleBtn');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.top.location.href = backBtn.href;
        });
    }

    // Connect WebSocket
    connectWebSocket();

    // Check microphone permissions
    checkMicrophonePermission();

    // Load craft selection from localStorage (default to glassblowing)
    state.craft = localStorage.getItem('craft') || 'glassblowing';
    // Create craft selector UI only (task selector removed)
    createElicitControlsUI();

    // Load managed cohorts for silo awareness (non-blocking)
    loadManagedCohorts().catch(() => {});

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

    // Apply language (reads localStorage preference or defaults to 'en')
    applyLanguage();

    console.log('Application initialized successfully');
}

function slugifyCraft(label) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

async function loadCustomCrafts(selectEl, addBtn) {
    if (!window.USER_ID) {
        if (addBtn) addBtn.style.display = 'none';
        return;
    }
    try {
        const resp = await fetch(`${API_BASE}/api/crafts`, {
            headers: { 'Authorization': `Bearer ${MOODLE_JWT || ''}` }
        });
        if (!resp.ok) {
            if (addBtn) addBtn.style.display = 'none';
            return;
        }
        const crafts = await resp.json();
        crafts.forEach(({ craft_key, craft_label }) => {
            if (!selectEl.querySelector(`option[value="${CSS.escape(craft_key)}"]`)) {
                const opt = document.createElement('option');
                opt.value = craft_key;
                opt.textContent = craft_label;
                opt.setAttribute('data-custom', '1');
                selectEl.appendChild(opt);
            }
        });
        if (state.craft && selectEl.querySelector(`option[value="${CSS.escape(state.craft)}"]`)) {
            selectEl.value = state.craft;
        }
    } catch (_) {
        if (addBtn) addBtn.style.display = 'none';
    }
}

function showAddCraftInput(wrapperEl, selectEl, addBtn) {
    addBtn.style.display = 'none';

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:4px;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = t('addCraftPlaceholder') || 'New domain name';
    input.maxLength = 100;
    input.style.cssText = 'padding:4px 6px;border-radius:4px;border:1px solid #ccc;font-size:0.85rem;width:160px;';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = t('addCraftConfirm') || 'Add';
    confirmBtn.style.cssText = 'padding:4px 8px;border-radius:4px;border:1px solid #aaa;cursor:pointer;font-size:0.85rem;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '×';
    cancelBtn.style.cssText = 'padding:4px 7px;border-radius:4px;border:1px solid #aaa;cursor:pointer;font-size:0.85rem;';

    const msgEl = document.createElement('span');
    msgEl.style.cssText = 'font-size:0.8rem;color:#c00;margin-left:4px;';

    const restore = () => {
        inputRow.remove();
        addBtn.style.display = '';
    };

    cancelBtn.addEventListener('click', restore);

    confirmBtn.addEventListener('click', async () => {
        const label = input.value.trim();
        if (!label) { msgEl.textContent = t('addCraftEmpty') || 'Enter a name'; return; }
        if (label.length > 100) { msgEl.textContent = t('addCraftTooLong') || 'Max 100 chars'; return; }
        if (!slugifyCraft(label)) { msgEl.textContent = t('addCraftInvalid') || 'Invalid name'; return; }

        confirmBtn.disabled = true;
        msgEl.textContent = '';
        try {
            const resp = await fetch(`${API_BASE}/api/crafts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${MOODLE_JWT || ''}`
                },
                body: JSON.stringify({ craft_label: label })
            });
            if (resp.status === 409) {
                msgEl.textContent = t('addCraftDuplicate') || 'Already exists';
                confirmBtn.disabled = false;
                return;
            }
            if (!resp.ok) throw new Error('Server error');
            const { craft_key, craft_label } = await resp.json();
            const opt = document.createElement('option');
            opt.value = craft_key;
            opt.textContent = craft_label;
            opt.setAttribute('data-custom', '1');
            selectEl.appendChild(opt);
            selectEl.value = craft_key;
            state.craft = craft_key;
            try { localStorage.setItem('craft', craft_key); } catch (_) {}
            restore();
        } catch (_) {
            msgEl.textContent = t('addCraftError') || 'Could not save';
            confirmBtn.disabled = false;
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmBtn.click();
        if (e.key === 'Escape') restore();
    });

    inputRow.appendChild(input);
    inputRow.appendChild(confirmBtn);
    inputRow.appendChild(cancelBtn);
    inputRow.appendChild(msgEl);
    wrapperEl.appendChild(inputRow);
    input.focus();
}

// Create a small craft selector UI under the recording controls
function createElicitControlsUI() {
    try {
        const controls = document.getElementById('recordingControls');
        if (!controls) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'elicit-controls';
        wrapper.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:12px;flex-shrink:0;';

        // --- Craft domain selector ---
        const craftLabel = document.createElement('label');
        craftLabel.textContent = t('craftDomainLabel');
        craftLabel.htmlFor = 'craftSelector';
        craftLabel.style.cssText = 'font-size:0.8rem;font-weight:500;color:#4b5563;white-space:nowrap;cursor:default;';

        const craftSelect = document.createElement('select');
        craftSelect.id = 'craftSelector';
        craftSelect.style.padding = '6px 8px';
        craftSelect.style.borderRadius = '4px';
        craftSelect.style.border = '1px solid #ccc';
        craftSelect.style.width = 'fit-content';

        [
            { value: 'glassblowing', key: 'craft_glassblowing' },
            { value: 'scientific_glassblowing', key: 'craft_scientific_glassblowing' },
            { value: 'jewelry', key: 'craft_jewelry' },
            { value: 'glovemaking', key: 'craft_glovemaking' },
            { value: 'saddlery', key: 'craft_saddlery' },
        ].forEach(o => {
            const option = document.createElement('option');
            option.value = o.value;
            option.setAttribute('data-craft-key', o.key);
            option.textContent = t(o.key);
            craftSelect.appendChild(option);
        });

        craftSelect.value = state.craft || 'glassblowing';
        craftSelect.addEventListener('change', (e) => {
            state.craft = e.target.value;
            try { localStorage.setItem('craft', state.craft); } catch (e) { }
        });

        const addCraftBtn = document.createElement('button');
        addCraftBtn.textContent = '+';
        addCraftBtn.title = t('addCraftTitle') || 'Add custom domain';
        addCraftBtn.style.cssText = 'padding:4px 8px;border-radius:4px;border:1px solid #ccc;cursor:pointer;font-size:0.85rem;margin-left:6px;vertical-align:middle;';
        addCraftBtn.addEventListener('click', () => showAddCraftInput(wrapper, craftSelect, addCraftBtn));

        // Craft label + select + add-button, all inline
        const craftRow = document.createElement('div');
        craftRow.style.cssText = 'display:flex;align-items:center;gap:6px;';
        craftRow.appendChild(craftLabel);
        craftRow.appendChild(craftSelect);
        craftRow.appendChild(addCraftBtn);
        wrapper.appendChild(craftRow);

        loadCustomCrafts(craftSelect, addCraftBtn);

        // --- Segment selector ---
        const segWrapper = document.createElement('div');
        segWrapper.id = 'segmentSelectorWrapper';
        segWrapper.style.display = 'none'; // hidden until segments exist

        const segLabel = document.createElement('label');
        segLabel.textContent = t('segmentSelectorLabel');
        segLabel.htmlFor = 'segmentSelector';
        segLabel.style.cssText = 'font-size:0.8rem;font-weight:500;color:#4b5563;white-space:nowrap;cursor:default;';

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

        // Segment label + select, inline
        segWrapper.style.cssText = 'display:none;align-items:center;gap:6px;';
        segWrapper.appendChild(segLabel);
        segWrapper.appendChild(segSelect);
        wrapper.appendChild(segWrapper);

        // Append inside control-buttons-group so everything shares one horizontal line
        const controlButtonsGroup = controls.querySelector('.control-buttons-group');
        if (controlButtonsGroup) {
            controlButtonsGroup.appendChild(wrapper);
        } else {
            controls.insertBefore(wrapper, controls.firstChild);
        }
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
    placeholder.textContent = t('segmentSelectorPlaceholder');
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

    wrapper.style.display = 'flex';
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
        await loadVideos();

        if (state.videos.length > 0) {
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

    // Upload Video button → trigger native file picker
    const uploadVideoBtn = document.getElementById('uploadVideoBtn');
    const videoUploadInput = document.getElementById('videoUploadInput');
    if (uploadVideoBtn && videoUploadInput) {
        uploadVideoBtn.addEventListener('click', () => videoUploadInput.click());
        videoUploadInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) {
                await uploadVideos(files);
            }
            videoUploadInput.value = '';
        });
    }
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
            if (!message.transcription || !message.transcription.trim()) {
                showToast('Transcription Failed', 'Transcription was empty — check your microphone.', 'error');
                updateAnnotationStatus(message.annotation_id, 'failed');
                break;
            }
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
        updateRecordingStatus('ready', t('statusReadyToRecord'));
        console.log('Microphone permission granted');
    } catch (error) {
        console.error('Microphone permission denied:', error);
        showToast('Microphone Access Required', 'Please grant microphone permission to record annotations', 'warning');
        updateRecordingStatus('error', currentLang === 'fr' ? 'Micro refusé' : 'Microphone Access Denied');
    }
}


const activeUploads = new Map();

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

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.gap = '8px';
        header.style.marginBottom = '4px';

        const label = document.createElement('div');
        label.className = 'upload-row-label';
        label.textContent = fileName;
        label.style.fontSize = '12px';
        label.style.flex = '1';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.whiteSpace = 'nowrap';
        header.appendChild(label);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'upload-row-cancel';
        cancelBtn.title = t('cancel') || 'Cancel';
        cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
        cancelBtn.style.background = 'transparent';
        cancelBtn.style.border = 'none';
        cancelBtn.style.color = '#888';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.style.fontSize = '12px';
        cancelBtn.style.padding = '0 4px';
        cancelBtn.addEventListener('click', () => {
            const xhr = activeUploads.get(fileName);
            if (xhr) xhr.abort();
            removeUploadRow(fileName);
        });
        header.appendChild(cancelBtn);

        row.appendChild(header);

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

    let succeeded = 0;
    for (const file of files) {
        try {
            await uploadSingleFile(file);
            succeeded++;
        } catch (err) {
            if (err && err.aborted) continue;
            showToast('Upload failed', err.message || file.name, 'error');
        }
    }

    const panel = document.getElementById('uploadProgressPanel');
    if (panel) setTimeout(() => panel.remove(), 2000);

    if (succeeded > 0) {
        await loadVideos();
        showToast('Upload complete', `${succeeded} video${succeeded > 1 ? 's' : ''} ready`, 'success');
        showVideoModal();
    }
}

function uploadSingleFile(file) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/api/videos/upload`);

        if (MOODLE_JWT) {
            xhr.setRequestHeader('Authorization', `Bearer ${MOODLE_JWT}`);
        }

        activeUploads.set(file.name, xhr);
        const cleanup = () => activeUploads.delete(file.name);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                updateUploadRow(file.name, percent);
            }
        };

        xhr.onload = () => {
            cleanup();
            if (xhr.status >= 200 && xhr.status < 300) {
                updateUploadRow(file.name, 100);
                resolve();
            } else {
                reject(new Error(xhr.responseText || 'Upload failed'));
            }
        };

        xhr.onerror = () => {
            cleanup();
            reject(new Error('Upload failed'));
        };

        xhr.onabort = () => {
            cleanup();
            const err = new Error('Upload cancelled');
            err.aborted = true;
            reject(err);
        };

        const formData = new FormData();
        formData.append('file', file, file.name);
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
function closeVideoModal() {
    document.getElementById('videoListModal').classList.remove('active');
}

function showVideoModal() {
    const modal = document.getElementById('videoListModal');
    const container = document.getElementById('videoListContainer');

    container.innerHTML = '';

    // ── Loaded videos (plugin-side records) ─────────────────────────────────
    if (state.videos.length === 0) {
        container.innerHTML = `<p class="empty-state" style="color:#999;font-size:0.9rem;padding:0.5rem 0;">${t('noVideosLoaded')}</p>`;
    } else {
        state.videos.forEach(video => {
            const item = document.createElement('div');
            item.className = 'video-list-item';
            if (state.currentVideoId === video.id) {
                item.classList.add('active');
            }

            const displayName = (video.display_name && video.display_name.trim())
                ? video.display_name
                : video.filename;
            const showRawBelow = displayName !== video.filename;

            item.innerHTML = `
                <div class="video-list-name">${escapeHtml(displayName)}</div>
                ${showRawBelow ? `<div class="video-list-rawname" title="${escapeHtml(video.filename)}">${escapeHtml(video.filename)}</div>` : ''}
                <div class="video-list-meta">
                    ${formatFileSize(video.file_size)} • ${video.annotation_count} elicitations
                </div>
                <div class="video-list-actions">
                    <button class="btn btn-icon btn-small video-rename-btn"
                        title="${t('renameVideo')}"
                        onclick="event.stopPropagation(); renameVideo(${video.id})">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="btn btn-icon btn-small btn-danger video-delete-btn"
                        title="${t('removeFromPlugin')}"
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

    modal.classList.add('active');
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

        // Set video source. Append JWT token so the Moodle stream.php proxy can
        // authenticate the browser redirect — <video> src requests don't carry
        // the Authorization header that our fetch() patch injects.
        const videoPlayer = document.getElementById('videoPlayer');
        const videoSource = document.getElementById('videoSource');
        const tokenParam = MOODLE_JWT ? `?token=${encodeURIComponent(MOODLE_JWT)}` : '';
        videoSource.src = `${API_BASE}/api/videos/${videoId}/file${tokenParam}`;
        videoPlayer.load();

        // Update video info
        document.getElementById('videoName').textContent = (video.display_name && video.display_name.trim()) ? video.display_name : video.filename;
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

        // Let the browser choose the codec — do NOT specify mimeType explicitly,
        // as forcing 'audio/webm;codecs=opus' causes Brave to produce near-empty recordings.
        state.mediaRecorder = new MediaRecorder(stream);
        state.recordingMimeType = state.mediaRecorder.mimeType || 'audio/webm';
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
        updateRecordingStatus('recording', t('statusRecording'));
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
        updateRecordingStatus('ready', t('statusReadyToRecord'));
        document.getElementById('recordBtn').classList.remove('recording');
        document.getElementById('recordBtn').disabled = false;
        document.getElementById('recordingTimer').style.display = 'none';
        document.getElementById('recordingPulse').style.display = 'none';
        return;
    }

    // Update UI
    updateRecordingStatus('processing', t('statusProcessing'));
    document.getElementById('recordBtn').classList.remove('recording');
    document.getElementById('recordBtn').classList.add('processing');
    document.getElementById('recordBtn').disabled = true;
    document.getElementById('recordingTimer').style.display = 'none';

    try {
        // Create audio blob with the actual MIME type the recorder used.
        const actualMime = state.recordingMimeType || 'audio/webm';
        const audioExt = actualMime.startsWith('audio/ogg') ? 'ogg' : 'webm';
        const audioBlob = new Blob(state.audioChunks, { type: actualMime });

        // Send to server using FormData
        showLoading('Saving annotation...');

        // Ensure times are properly formatted with sufficient precision
        const startTime = parseFloat(state.recordingStartTime.toFixed(3));
        const endTime = parseFloat(recordingEndTime.toFixed(3));

        // Create FormData for multipart upload
        const formData = new FormData();
        formData.append('audio_blob', audioBlob, `recording.${audioExt}`);
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

        // Keep state.videos in sync so the Select Video modal shows the correct count
        const vid = state.videos.find(v => v.id === state.currentVideoId);
        if (vid) vid.annotation_count = (vid.annotation_count || 0) + 1;

    } catch (error) {
        console.error('Error saving annotation:', error);
        showToast('Error', 'Failed to save annotation', 'error');
    } finally {
        hideLoading();

        // Reset UI
        updateRecordingStatus('ready', t('statusReadyToRecord'));
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
        // Fire-and-forget: score unscored transcripts, aggregate, repaint banner + pips.
        if (typeof updateCoverageForAnnotations === 'function') {
            updateCoverageForAnnotations().catch(e => console.warn('coverage update failed', e));
        }
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
                <p>${t('noAnnotationsYet')}</p>
                <p class="hint">${t('noAnnotationsHint')}</p>
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

        // ── In-place guided Q&A mode ──────────────────────────────────────────
        if (state.guidedQA.annotationId === annotation.id) {
            item.classList.add('elicit-inplace-active');
            item.style.cursor = 'default';

            const qa = state.guidedQA;
            const qIdx = qa.currentIndex;
            const questionText = qa.questions[qIdx] || '';
            const total = qa.questions.length;
            const annId = annotation.id;

            item.innerHTML = `
                <div class="elicit-inplace-question-area" id="eip-question-area-${annId}">
                    <div class="elicit-inplace-question-card" id="eip-question-card-${annId}">
                        <div class="eip-question-progress">${qIdx + 1} / ${total}</div>
                        <div class="eip-question-text" id="eip-question-text-${annId}">${escapeHtml(questionText)}</div>
                    </div>
                </div>
                <div class="elicit-inplace-transcription-area">
                    <textarea class="eip-transcription-textarea" id="eip-transcript-${annId}" readonly placeholder="La transcription apparaîtra ici…"></textarea>
                    <div class="eip-transcribing-hint" id="eip-hint-${annId}" style="display:none;">
                        <span class="eip-spinner"></span> Transcription…
                    </div>
                </div>
                <div class="elicit-inplace-record-area">
                    <button class="eip-record-btn" id="eip-record-btn-${annId}" onclick="toggleInPlaceRecording(${annId})" title="${t('recordAnswer')}">
                        <i class="fa-solid fa-microphone" id="eip-record-icon-${annId}"></i>
                    </button>
                    <div class="eip-record-actions">
                        <button class="btn btn-small btn-secondary" onclick="skipInPlaceQuestion(${annId})">${currentLang === 'fr' ? 'Passer' : 'Skip'} <i class="fa-solid fa-arrow-right"></i></button>
                        <button class="btn btn-small btn-danger" onclick="cancelInPlaceQA(${annId})">${t('cancel')}</button>
                    </div>
                </div>
            `;

            container.appendChild(item);
            // Show the question with slide-in animation
            requestAnimationFrame(() => {
                const card = document.getElementById(`eip-question-card-${annId}`);
                if (card) card.classList.add('eip-slide-in');
            });
            return; // skip normal card rendering
        }

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
            } else {
                const tagsInner = (annotation.tags || []).map((tag, idx) => {
                    const cat = tag.category || '';
                    return `<span class="annotation-tag category-${cat}" title="${escapeHtml(cat)} - Click to delete" onclick="deleteTag(event, ${annotation.id}, ${idx})">${escapeHtml(tag.name)}</span>`;
                }).join('');
                const addTagBtn = `<button class="add-tag-btn" onclick="event.stopPropagation(); openAddTagInline(event, ${annotation.id})" title="Add a tag">+</button>`;
                tagsHTML = `<div class="annotation-tags" id="annotation-tags-${annotation.id}">${tagsInner}${addTagBtn}</div>`;
            }
        }

        // --- Relaunch tagging button (shown once transcription done) ---
        let relaunchTaggingBtn = '';
        if (annotation.transcription_status === 'completed') {
            relaunchTaggingBtn = `<button class="btn btn-icon btn-tiny" onclick="event.stopPropagation(); triggerTagging(${annotation.id});" title="${t('relaunchTagging')}"><i class="fa-solid fa-tags"></i></button>`;
        }

        // --- Coverage panel (Quoi / Comment / Pourquoi, spaCy-driven) ---
        // Replaces the legacy HOW/EVALUATION/FEEDBACK review. No LLM call per
        // annotation — everything here comes from the cached coverage score.
        const reviewPanelHTML = renderCoveragePanel(annotation);
        const weakBadgeHTML = isAnnotationWeak(annotation)
            ? `<span class="annotation-weak-badge" title="Élicitation courte : peu de marqueurs détectés."><i class="fa-solid fa-triangle-exclamation"></i> Élicitation brève</span>`
            : '';

        item.innerHTML = `
            <div class="annotation-header">
                <div class="annotation-time-wrapper">
                    <span class="annotation-time">
                        ${formatTime(annotation.start_time)} - ${formatTime(annotation.end_time)}
                        (${duration.toFixed(1)}s)
                    </span>
                    ${weakBadgeHTML}
                    ${taskBadgeHTML}
                </div>
                <div class="annotation-actions">
                    <button class="btn btn-icon btn-small play-btn" onclick="seekToAnnotation(${annotation.start_time})" title="${t('jumpToTime')}">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn btn-icon btn-small" onclick="startEditTranscription(${annotation.id})" title="${t('editTranscription')}">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="btn btn-icon btn-small" onclick="deleteAnnotation(${annotation.id})" title="${t('deleteAnnotation')}">
                        <i class="fas fa-trash"></i>
                    </button>
                    ${(() => {
                        const score = state.coverage && state.coverage.scores && state.coverage.scores[annotation.id];
                        const anyAbsent = score && COVERAGE_PHASES.some(p => ((score[p] || {}).status || 'absent') === 'absent');
                        return anyAbsent ? `<button class="btn btn-icon btn-small coverage-action-btn coverage-action-btn--secondary" onclick="event.stopPropagation(); retranscribeAnnotation(${annotation.id})" title="${escapeHtml(t('coverageRetranscribeTitle'))}"><i class="fa-solid fa-microphone"></i></button>` : '';
                    })()}
                </div>
            </div>
            <div class="annotation-transcription">
                ${annotation.transcription || `<em>${t('transcriptionPending')}</em>`}
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

const TAG_CATEGORIES = ['tool', 'material', 'technique', 'handling', 'action'];

function openAddTagInline(event, annotationId) {
    const tagsContainer = document.getElementById(`annotation-tags-${annotationId}`);
    if (!tagsContainer) return;

    // Build inline form
    const form = document.createElement('div');
    form.className = 'add-tag-inline-form';
    form.id = `add-tag-form-${annotationId}`;
    form.onclick = e => e.stopPropagation();

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Tag name';
    input.className = 'add-tag-input';
    input.maxLength = 40;

    const select = document.createElement('select');
    select.className = 'add-tag-category';
    TAG_CATEGORIES.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
        select.appendChild(opt);
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'add-tag-confirm-btn';
    confirmBtn.innerHTML = '<i class="fas fa-arrow-right"></i>';
    confirmBtn.title = 'Add tag';
    confirmBtn.onclick = e => { e.stopPropagation(); submitNewTag(annotationId, input.value, select.value); };

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'add-tag-cancel-btn';
    cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
    cancelBtn.title = 'Cancel';
    cancelBtn.onclick = e => { e.stopPropagation(); renderAnnotations(); };

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); submitNewTag(annotationId, input.value, select.value); }
        if (e.key === 'Escape') { e.preventDefault(); renderAnnotations(); }
    });

    form.appendChild(input);
    form.appendChild(select);
    form.appendChild(confirmBtn);
    form.appendChild(cancelBtn);

    // Replace the tags container contents with the form
    tagsContainer.innerHTML = '';
    tagsContainer.appendChild(form);
    input.focus();
}

async function submitNewTag(annotationId, tagName, category) {
    tagName = tagName.trim();
    if (!tagName) return;

    const annotation = state.annotations.find(a => a.id === annotationId);
    if (!annotation) return;

    const existingTags = annotation.tags || [];
    if (existingTags.some(t => t.name.toLowerCase() === tagName.toLowerCase())) {
        renderAnnotations();
        return;
    }

    const newTags = [...existingTags, { name: tagName, category }];
    try {
        const response = await fetch(`${API_BASE}/api/annotations/${annotationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: JSON.stringify(newTags) })
        });
        if (!response.ok) throw new Error('Failed to add tag');
        annotation.tags = newTags;
    } catch (err) {
        showToast('Error', err.message, 'error');
    }
    renderAnnotations();
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

    // Collect questions: priority_prompts first, then per-dimension prompts from incomplete dims.
    // This ensures we capture every prompt-item the user sees in the review panel.
    let questions = [];
    if (review) {
        if (Array.isArray(review.priority_prompts) && review.priority_prompts.length > 0) {
            questions = review.priority_prompts.slice();
        }
        // Also gather dim.prompts from every incomplete dimension not already covered
        const dims = review.dimensions || {};
        ['HOW', 'EVALUATION', 'FEEDBACK'].forEach(key => {
            const dim = dims[key];
            if (dim && !dim.covered && Array.isArray(dim.prompts)) {
                dim.prompts.forEach(p => {
                    if (!questions.includes(p)) questions.push(p);
                });
            }
        });
    }

    if (questions.length > 0) {
        // --- Guided Q&A: render in-place inside the annotation card ---
        state.guidedQA.annotationId = annotationId;
        state.guidedQA.questions = questions;
        state.guidedQA.currentIndex = 0;
        state.guidedQA.originalTranscript = annotation.transcription || '';
        state.guidedQA.updatedTranscript = '';
        state.guidedQA.isRecording = false;
        state.guidedQA.mediaRecorder = null;
        state.guidedQA.audioChunks = [];
        renderAnnotations();
        // Scroll the activated card into view
        setTimeout(() => {
            const card = document.querySelector(`.annotation-item[data-id="${annotationId}"]`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
        return;
    }

    // --- Fallback: simple textarea mode (no priority prompts) ---
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'editElicitationModal';
    modal.innerHTML = `
        <div class="modal-content elicitation-modal-content">
            <div class="elicitation-modal-header">
                <h2 class="elicitation-modal-title">${t('modifyElicitation')}</h2>
                <button class="elicitation-modal-close" onclick="closeEditElicitationModal()" title="${currentLang === 'fr' ? 'Fermer' : 'Close'}" aria-label="${currentLang === 'fr' ? 'Fermer' : 'Close'}">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="elicitation-modal-body">
                <label class="elicitation-textarea-label" for="elicitationTextEdit">${currentLang === 'fr' ? 'Transcription' : 'Transcription'}</label>
                <textarea id="elicitationTextEdit" rows="10">${escapeHtml(annotation.transcription || '')}</textarea>
            </div>
            <div class="elicitation-modal-footer">
                <button class="btn btn-secondary" onclick="closeEditElicitationModal()">${t('cancel')}</button>
                <button class="btn btn-primary" onclick="saveElicitationEdit(${annotationId})">
                    <i class="fa-solid fa-rotate-right"></i> ${currentLang === 'fr' ? 'Enregistrer et re-analyser' : 'Save & re-analyze'}
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

// ─────────────────────────────────────────────────────────────────────────────
// Guided Q&A voice enrichment mode
// ─────────────────────────────────────────────────────────────────────────────

function openGuidedQAModal(annotationId, questions, originalTranscript) {
    // Init guided Q&A state
    state.guidedQA.annotationId = annotationId;
    state.guidedQA.questions = questions;
    state.guidedQA.currentIndex = 0;
    state.guidedQA.originalTranscript = originalTranscript;
    state.guidedQA.updatedTranscript = '';
    state.guidedQA.isRecording = false;
    state.guidedQA.mediaRecorder = null;
    state.guidedQA.audioChunks = [];

    const annotation = state.annotations.find(a => a.id === annotationId);

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'guidedQAModal';
    modal.innerHTML = `
        <div class="modal-content guided-qa-modal-content">
            <div class="elicitation-modal-header">
                <div class="qa-header-left">
                    <h2 class="elicitation-modal-title">${currentLang === 'fr' ? "Enrichir l'élicitation" : 'Enrich elicitation'}</h2>
                    <span class="qa-progress" id="qaProgress">${currentLang === 'fr' ? 'Question' : 'Question'} 1 / ${questions.length}</span>
                </div>
                <button class="elicitation-modal-close" onclick="closeGuidedQAModal()" title="${t('close')}" aria-label="${t('close')}">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="qa-replay-bar">
                <button class="btn btn-icon qa-replay-btn" onclick="replaySegmentOnce()" title="${t('replaySegment')}">
                    <i class="fa-solid fa-rotate-right"></i>
                </button>
                <span class="qa-replay-label">${t('replaySegmentFor')}</span>
            </div>
            <div class="elicitation-modal-body qa-modal-body">
                <div class="qa-question-card" id="qaQuestionCard">
                    <div class="qa-question-text" id="qaQuestionText"></div>
                </div>
                <div class="qa-voice-area">
                    <button class="qa-record-btn" id="qaRecordBtn" onclick="toggleGuidedRecording()">
                        <i class="fa-solid fa-microphone" id="qaRecordIcon"></i>
                        <span id="qaRecordLabel">${t('answerByVoice')}</span>
                    </button>
                    <div class="qa-transcript-preview" id="qaTranscriptPreview"></div>
                </div>
            </div>
            <div class="elicitation-modal-footer qa-modal-footer">
                <button class="btn btn-secondary" onclick="closeGuidedQAModal()">${t('cancel')}</button>
                <button class="qa-skip-btn" onclick="skipCurrentQuestion()">
                    ${currentLang === 'fr' ? 'Passer' : 'Skip'} <i class="fa-solid fa-arrow-right"></i>
                </button>
                <button class="btn btn-primary" onclick="finishGuidedQA()">
                    <i class="fa-solid fa-check"></i> ${currentLang === 'fr' ? 'Terminer' : 'Finish'}
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';

    // Start looping the segment
    if (annotation) startSegmentLoop(annotation);

    // Show first question
    showQAQuestion(0);
}

function showQAQuestion(index) {
    const qa = state.guidedQA;
    const total = qa.questions.length;
    const questionText = document.getElementById('qaQuestionText');
    const progress = document.getElementById('qaProgress');
    const card = document.getElementById('qaQuestionCard');
    const preview = document.getElementById('qaTranscriptPreview');
    const recordBtn = document.getElementById('qaRecordBtn');
    const recordLabel = document.getElementById('qaRecordLabel');

    if (!questionText || !card) return;

    // Reset voice area
    if (preview) preview.textContent = '';
    if (recordBtn) {
        recordBtn.classList.remove('recording', 'processing', 'answered');
    }
    if (recordLabel) recordLabel.textContent = t('answerByVoice');

    // Update progress
    if (progress) progress.textContent = `Question ${index + 1} / ${total}`;

    // Animate card in
    card.classList.remove('qa-fade-in', 'qa-slide-out', 'answered');
    void card.offsetWidth; // force reflow
    questionText.textContent = qa.questions[index];
    card.classList.add('qa-fade-in');
}

async function toggleGuidedRecording() {
    if (state.guidedQA.isRecording) {
        await stopGuidedRecording();
    } else {
        await startGuidedRecording();
    }
}

async function startGuidedRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.guidedQA.mediaRecorder = new MediaRecorder(stream);
        state.guidedQA.recordingMimeType = state.guidedQA.mediaRecorder.mimeType || 'audio/webm';
        state.guidedQA.audioChunks = [];

        state.guidedQA.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) state.guidedQA.audioChunks.push(event.data);
        };
        state.guidedQA.mediaRecorder.onstop = handleGuidedRecordingStop;
        state.guidedQA.mediaRecorder.start();
        state.guidedQA.isRecording = true;

        const btn = document.getElementById('qaRecordBtn');
        const label = document.getElementById('qaRecordLabel');
        if (btn) btn.classList.add('recording');
        if (label) label.textContent = 'Arrêter l\'enregistrement';
    } catch (error) {
        showToast('Erreur micro', 'Impossible d\'accéder au microphone', 'error');
    }
}

async function stopGuidedRecording() {
    if (!state.guidedQA.mediaRecorder || !state.guidedQA.isRecording) return;
    state.guidedQA.isRecording = false;
    state.guidedQA.mediaRecorder.stop();
    state.guidedQA.mediaRecorder.stream.getTracks().forEach(t => t.stop());

    const btn = document.getElementById('qaRecordBtn');
    const label = document.getElementById('qaRecordLabel');
    if (btn) { btn.classList.remove('recording'); btn.classList.add('processing'); btn.disabled = true; }
    if (label) label.textContent = t('transcribingInProgress');
}

async function handleGuidedRecordingStop() {
    const actualMime = state.guidedQA.recordingMimeType || 'audio/webm';
    const audioExt = actualMime.startsWith('audio/ogg') ? 'ogg' : 'webm';
    const audioBlob = new Blob(state.guidedQA.audioChunks, { type: actualMime });
    const formData = new FormData();
    formData.append('audio_blob', audioBlob, `answer.${audioExt}`);

    const btn = document.getElementById('qaRecordBtn');
    const label = document.getElementById('qaRecordLabel');
    const preview = document.getElementById('qaTranscriptPreview');

    try {
        const headers = {};
        if (MOODLE_JWT) headers['Authorization'] = `Bearer ${MOODLE_JWT}`;
        const resp = await fetch(`${API_BASE}/api/annotations/transcribe-only`, {
            method: 'POST',
            headers,
            body: formData
        });

        if (!resp.ok) throw new Error('Transcription échouée');
        const data = await resp.json();
        const transcription = (data.transcription || '').trim();

        // Heuristic: ≥ 3 words = valid answer
        const wordCount = transcription.split(/\s+/).filter(w => w.length > 0).length;
        if (wordCount < 3) {
            if (preview) preview.textContent = transcription ? `"${transcription}" — trop court, réessayez.` : 'Aucune parole détectée.';
            if (btn) { btn.classList.remove('processing'); btn.disabled = false; }
            if (label) label.textContent = t('answerByVoice');
            return;
        }

        // Show preview
        if (preview) preview.textContent = `"${transcription}"`;

        // Append to updated transcript
        state.guidedQA.updatedTranscript += (state.guidedQA.updatedTranscript ? '\n\n' : '') + transcription;

        // Mark question as answered visually
        const card = document.getElementById('qaQuestionCard');
        if (card) {
            card.classList.add('answered');
            card.classList.add('qa-slide-out');
        }

        // Advance after animation
        setTimeout(() => advanceQAQuestion(), 600);

    } catch (err) {
        if (preview) preview.textContent = 'Erreur de transcription — réessayez.';
        if (btn) { btn.classList.remove('processing'); btn.disabled = false; }
        if (label) label.textContent = 'Répondre par la voix';
    }
}

function advanceQAQuestion() {
    state.guidedQA.currentIndex++;
    if (state.guidedQA.currentIndex < state.guidedQA.questions.length) {
        const btn = document.getElementById('qaRecordBtn');
        if (btn) { btn.classList.remove('processing'); btn.disabled = false; }
        showQAQuestion(state.guidedQA.currentIndex);
    } else {
        finishGuidedQA();
    }
}

function skipCurrentQuestion() {
    // Skip without appending transcript
    advanceQAQuestion();
}

async function finishGuidedQA() {
    stopSegmentLoop();
    closeGuidedQAModal();

    const qa = state.guidedQA;
    if (!qa.updatedTranscript) {
        // Nothing was recorded — just close
        return;
    }

    const combined = qa.originalTranscript.trim()
        ? qa.originalTranscript.trim() + '\n\n' + qa.updatedTranscript.trim()
        : qa.updatedTranscript.trim();

    await saveElicitationEdit(qa.annotationId, combined);
}

function closeGuidedQAModal() {
    stopSegmentLoop();
    // Stop any ongoing guided recording
    if (state.guidedQA.isRecording && state.guidedQA.mediaRecorder) {
        state.guidedQA.isRecording = false;
        try { state.guidedQA.mediaRecorder.stop(); } catch(e) {}
        try { state.guidedQA.mediaRecorder.stream.getTracks().forEach(t => t.stop()); } catch(e) {}
    }
    const modal = document.getElementById('guidedQAModal');
    if (modal) modal.remove();
}

// ─────────────────────────────────────────────────────────────────────────────
// In-place annotation Q&A functions (replaces modal-based guided QA)
// ─────────────────────────────────────────────────────────────────────────────

function cancelInPlaceQA(annotationId) {
    if (state.guidedQA.isRecording && state.guidedQA.mediaRecorder) {
        state.guidedQA.isRecording = false;
        try { state.guidedQA.mediaRecorder.stop(); } catch(e) {}
        try { state.guidedQA.mediaRecorder.stream.getTracks().forEach(t => t.stop()); } catch(e) {}
    }
    state.guidedQA.annotationId = null;
    state.guidedQA.questions = [];
    renderAnnotations();
}

async function toggleInPlaceRecording(annotationId) {
    if (state.guidedQA.isRecording) {
        await stopInPlaceRecording(annotationId);
    } else {
        await startInPlaceRecording(annotationId);
    }
}

async function startInPlaceRecording(annotationId) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.guidedQA.mediaRecorder = new MediaRecorder(stream);
        state.guidedQA.recordingMimeType = state.guidedQA.mediaRecorder.mimeType || 'audio/webm';
        state.guidedQA.audioChunks = [];

        state.guidedQA.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) state.guidedQA.audioChunks.push(e.data);
        };
        state.guidedQA.mediaRecorder.onstop = () => handleInPlaceRecordingStop(annotationId);
        state.guidedQA.mediaRecorder.start();
        state.guidedQA.isRecording = true;

        const btn = document.getElementById(`eip-record-btn-${annotationId}`);
        if (btn) btn.classList.add('recording');
    } catch (error) {
        showToast('Erreur micro', 'Impossible d\'accéder au microphone', 'error');
    }
}

async function stopInPlaceRecording(annotationId) {
    if (!state.guidedQA.mediaRecorder || !state.guidedQA.isRecording) return;
    state.guidedQA.isRecording = false;
    state.guidedQA.mediaRecorder.stop();
    state.guidedQA.mediaRecorder.stream.getTracks().forEach(t => t.stop());

    const btn = document.getElementById(`eip-record-btn-${annotationId}`);
    if (btn) { btn.classList.remove('recording'); btn.classList.add('processing'); btn.disabled = true; }

    const hint = document.getElementById(`eip-hint-${annotationId}`);
    if (hint) hint.style.display = 'flex';
}

async function handleInPlaceRecordingStop(annotationId) {
    const actualMime = state.guidedQA.recordingMimeType || 'audio/webm';
    const audioExt = actualMime.startsWith('audio/ogg') ? 'ogg' : 'webm';
    const audioBlob = new Blob(state.guidedQA.audioChunks, { type: actualMime });
    const formData = new FormData();
    formData.append('audio_blob', audioBlob, `answer.${audioExt}`);

    const btn = document.getElementById(`eip-record-btn-${annotationId}`);
    const hint = document.getElementById(`eip-hint-${annotationId}`);
    const textarea = document.getElementById(`eip-transcript-${annotationId}`);

    try {
        const resp = await fetch(`${API_BASE}/api/annotations/transcribe-only`, {
            method: 'POST',
            body: formData
        });
        if (!resp.ok) throw new Error('Transcription failed');
        const data = await resp.json();
        const transcription = (data.transcription || '').trim();

        if (hint) hint.style.display = 'none';

        const wordCount = transcription.split(/\s+/).filter(w => w.length > 0).length;
        if (wordCount < 3) {
            if (textarea) textarea.value = transcription ? `"${transcription}" — trop court, réessayez.` : 'Aucune parole détectée.';
            if (btn) { btn.classList.remove('processing'); btn.disabled = false; }
            return;
        }

        // Show in textarea
        if (textarea) textarea.value = transcription;

        // Accumulate transcript
        state.guidedQA.updatedTranscript += (state.guidedQA.updatedTranscript ? '\n\n' : '') + transcription;

        // Animate question card as answered (green bg, fade out, scroll down)
        const card = document.getElementById(`eip-question-card-${annotationId}`);
        if (card) {
            card.classList.add('eip-answered');
            setTimeout(() => {
                card.classList.add('eip-slide-out');
                setTimeout(() => advanceInPlaceQuestion(annotationId), 500);
            }, 400);
        } else {
            advanceInPlaceQuestion(annotationId);
        }

    } catch (err) {
        if (hint) hint.style.display = 'none';
        if (textarea) textarea.value = 'Erreur de transcription — réessayez.';
        if (btn) { btn.classList.remove('processing'); btn.disabled = false; }
    }
}

function advanceInPlaceQuestion(annotationId) {
    state.guidedQA.currentIndex++;
    if (state.guidedQA.currentIndex < state.guidedQA.questions.length) {
        // Re-render to show next question with fresh state
        renderAnnotations();
        requestAnimationFrame(() => {
            const card = document.getElementById(`eip-question-card-${annotationId}`);
            if (card) card.classList.add('eip-slide-in');
        });
    } else {
        finishInPlaceQA(annotationId);
    }
}

async function finishInPlaceQA(annotationId) {
    const qa = state.guidedQA;
    const combined = qa.originalTranscript.trim()
        ? qa.originalTranscript.trim() + '\n\n' + qa.updatedTranscript.trim()
        : qa.updatedTranscript.trim();

    state.guidedQA.annotationId = null;
    state.guidedQA.questions = [];
    renderAnnotations();

    if (combined) {
        await saveElicitationEdit(annotationId, combined);
    }
}

function skipInPlaceQuestion(annotationId) {
    advanceInPlaceQuestion(annotationId);
}

// ─────────────────────────────────────────────────────────────────────────────

function startSegmentLoop(annotation) {
    stopSegmentLoop();
    const videoPlayer = document.getElementById('videoPlayer');
    if (!videoPlayer || annotation.start_time == null || annotation.end_time == null) return;

    // Seek to start of segment immediately
    videoPlayer.currentTime = annotation.start_time;
    videoPlayer.play().catch(() => {});

    state.guidedQA.loopInterval = setInterval(() => {
        if (!document.getElementById('guidedQAModal')) {
            stopSegmentLoop();
            return;
        }
        if (videoPlayer.currentTime >= annotation.end_time) {
            videoPlayer.currentTime = annotation.start_time;
        }
    }, 150);
}

function stopSegmentLoop() {
    if (state.guidedQA.loopInterval) {
        clearInterval(state.guidedQA.loopInterval);
        state.guidedQA.loopInterval = null;
    }
}

function replaySegmentOnce() {
    const annotation = state.annotations.find(a => a.id === state.guidedQA.annotationId);
    if (!annotation) return;
    const videoPlayer = document.getElementById('videoPlayer');
    if (!videoPlayer) return;
    videoPlayer.currentTime = annotation.start_time;
    videoPlayer.play().catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────

async function saveElicitationEdit(annotationId, transcriptionOverride = null) {
    let newTranscription;
    if (transcriptionOverride !== null) {
        newTranscription = transcriptionOverride.trim();
    } else {
        const textarea = document.getElementById('elicitationTextEdit');
        newTranscription = textarea ? textarea.value.trim() : '';
    }
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

        if (!transcriptionOverride) closeEditElicitationModal();
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
    textarea.value = (originalText === TRANSLATIONS.en.transcriptionPending || originalText === TRANSLATIONS.fr.transcriptionPending || originalText === '') ? '' : originalText;

    const actions = document.createElement('div');
    actions.className = 'transcription-editor-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary btn-small';
    saveBtn.textContent = t('save');
    saveBtn.addEventListener('click', () => saveTranscriptionEdit(annotationId, textarea.value, item));

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary btn-small';
    cancelBtn.textContent = t('cancel');
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

        // Invalidate this annotation's cached coverage score so the detector
        // runs again against the new text on the next coverage refresh.
        if (state.coverage && state.coverage.scores) {
            delete state.coverage.scores[annotationId];
        }

        // Remove editor and re-render
        renderAnnotations();
        renderTimeline();
        // Re-score + re-aggregate + repaint banner, pips and panel.
        if (typeof updateCoverageForAnnotations === 'function') {
            updateCoverageForAnnotations().catch(e => console.warn('coverage refresh failed', e));
        }
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
        'pending': `<i class="fas fa-hourglass-half"></i> ${t('transcriptionPending')}`,
        'processing': `<i class="fas fa-spinner fa-spin"></i> ${t('transcribingAudio')}`,
        'completed': `<i class="fas fa-check-circle"></i> ${t('transcriptionComplete')}`,
        'failed': `<i class="fas fa-exclamation-circle"></i> ${t('transcriptionFailed')}`
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
                <h3>${currentLang === 'fr' ? 'Merci pour votre avis' : 'Thank you for your feedback'}</h3>
                <button class="feedback-modal-close">&times;</button>
            </div>
            <div class="feedback-modal-body">
                <p class="feedback-intro">${currentLang === 'fr'
                    ? `Veuillez sélectionner ce qui vous a ${isPositive ? 'plu' : 'déplu'} :`
                    : `Please select what you ${isPositive ? 'liked' : 'disliked'} :`}</p>
                <div class="feedback-choices">
                    ${choicesHTML}
                </div>
            </div>
            <div class="feedback-modal-footer">
                <button class="btn btn-secondary" onclick="closeFeedbackModal()">${t('cancel')}</button>
                <button class="btn btn-primary" onclick="submitFeedbackModal(${annotationId}, ${feedbackValue})">${currentLang === 'fr' ? 'Soumettre' : 'Submit'}</button>
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
        if (sdisp) sdisp.textContent = `${t('segmentStartPrefix')}: ${formatTime(s)}`;
        if (edisp) edisp.textContent = `${t('segmentEndPrefix')}: ${formatTime(e)}`;
    }

    // Pointer/drag handling
    // Seeks are deferred to mouseup/touchend only — writing currentTime on every
    // mousemove fires a new HTTP range request even on a paused video (the browser
    // must fetch+decode the new frame), which floods the server under fast scrubbing.
    let activeHandle = null;
    let dragWasPlaying = false;

    function getVid() {
        return document.getElementById('segmentPlayer') || document.getElementById('videoPlayer');
    }

    function onPointerMove(ev) {
        if (!activeHandle) return;
        ev.preventDefault();
        const rect = track.getBoundingClientRect();
        const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        let pct = ((clientX - rect.left) / rect.width) * 100;
        pct = Math.max(0, Math.min(100, pct));
        const t = percentToTime(pct);
        const vid = getVid();
        if (activeHandle === 'start') {
            const maxStart = (state.segmentEndTime != null) ? state.segmentEndTime - 0.1 : vid.duration - 0.1;
            state.segmentStartTime = Math.min(maxStart, Math.max(0, t));
        } else {
            const minEnd = (state.segmentStartTime != null) ? state.segmentStartTime + 0.1 : 0.1;
            const dur = vid ? vid.duration || 1 : 1;
            state.segmentEndTime = Math.max(minEnd, Math.min(dur, t));
        }
        updateUI();
    }

    function startDrag(handle) {
        activeHandle = handle;
        const vid = getVid();
        if (vid) { dragWasPlaying = !vid.paused; vid.pause(); }
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('mouseup', onPointerUp);
    }

    function onPointerUp() {
        const handle = activeHandle;
        activeHandle = null;
        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('mouseup', onPointerUp);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('touchend', onPointerUp);
        // Single seek after drag ends — one request, not dozens
        const vid = getVid();
        if (vid) {
            const t = (handle === 'start') ? state.segmentStartTime : state.segmentEndTime;
            if (t != null) vid.currentTime = t;
            if (dragWasPlaying) vid.play().catch(() => {});
        }
    }

    handleStart.addEventListener('mousedown', () => startDrag('start'));
    handleEnd.addEventListener('mousedown', () => startDrag('end'));
    handleStart.addEventListener('touchstart', () => {
        activeHandle = 'start';
        const vid = getVid();
        if (vid) { dragWasPlaying = !vid.paused; vid.pause(); }
        document.addEventListener('touchmove', onPointerMove, {passive:false});
        document.addEventListener('touchend', onPointerUp);
    }, {passive:false});
    handleEnd.addEventListener('touchstart', () => {
        activeHandle = 'end';
        const vid = getVid();
        if (vid) { dragWasPlaying = !vid.paused; vid.pause(); }
        document.addEventListener('touchmove', onPointerMove, {passive:false});
        document.addEventListener('touchend', onPointerUp);
    }, {passive:false});

    // Click on track sets nearest handle and seeks to that position
    track.addEventListener('click', (e) => {
        const rect = track.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        const sPct = timeToPercent(state.segmentStartTime || 0);
        const ePct = timeToPercent(state.segmentEndTime || getVid().duration || 1);
        const distStart = Math.abs(pct - sPct);
        const distEnd = Math.abs(pct - ePct);
        activeHandle = (distStart <= distEnd) ? 'start' : 'end';
        onPointerMove(e);
        onPointerUp();
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

    // Expose updater and highlight helper used elsewhere
    window.updateSegmentSliderUI = updateUI;
    window.highlightSegmentOnTrack = function(startTime, endTime) {
        let hl = document.getElementById('segmentHighlight');
        if (!hl) {
            hl = document.createElement('div');
            hl.id = 'segmentHighlight';
            hl.className = 'segment-highlight';
            track.appendChild(hl);
        }
        const sp = timeToPercent(startTime);
        const ep = timeToPercent(endTime);
        hl.style.left = `${sp}%`;
        hl.style.width = `${Math.max(0, ep - sp)}%`;
        hl.style.display = 'block';
        // Remove previous active-card highlight
        document.querySelectorAll('.segment-item.active').forEach(el => el.classList.remove('active'));
    };

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
                <h3>${t('noVideoLoaded')}</h3>
                <p>${t('noVideoHint')}</p>
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
    const tokenParam2 = MOODLE_JWT ? `?token=${encodeURIComponent(MOODLE_JWT)}` : '';
    src.src = `${API_BASE}/api/videos/${videoId}/file${tokenParam2}`;
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

    list.innerHTML = `<div class="empty-state"><p>${currentLang === 'fr' ? 'Chargement des segments…' : 'Loading segments…'}</p></div>`;

    if (!state.currentVideoId) {
        list.innerHTML = `<div class="empty-state"><p>${t('loadVideoFirst')}</p></div>`;
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
        list.innerHTML = `<div class="empty-state"><p>${currentLang === 'fr' ? 'Échec du chargement des segments' : 'Failed to load segments'}</p></div>`;
    }
}

function renderSegments() {
    const list = document.getElementById('segmentsList');
    if (!list) return;

    if (!state.segments || state.segments.length === 0) {
        list.innerHTML = `<div class="empty-state"><p>${t('noSegmentsForVideo')}</p></div>`;
        return;
    }

    list.innerHTML = '';
    state.segments.forEach(seg => {
        const duration = seg.end_time - seg.start_time;
        const item = document.createElement('div');
        item.className = 'segment-item';
        item.title = t('previewSegment');

        const nameSpan = document.createElement('span');
        nameSpan.className = 'segment-card-name';
        nameSpan.textContent = seg.name || `Segment ${seg.id}`;
        nameSpan.title = 'Double-click to rename';

        nameSpan.addEventListener('dblclick', e => {
            e.stopPropagation();
            startInlineRename(nameSpan, seg);
        });

        const cardBody = document.createElement('div');
        cardBody.className = 'segment-card-body';
        cardBody.innerHTML = `
            <div class="segment-card-times">
                <span><i class="fas fa-clock"></i> ${formatTime(seg.start_time)} – ${formatTime(seg.end_time)}</span>
                <span class="segment-card-duration">${formatTime(duration)}</span>
            </div>
        `;
        cardBody.insertBefore(nameSpan, cardBody.firstChild);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'segment-card-delete';
        deleteBtn.title = t('deleteSegment');
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.addEventListener('click', e => { e.stopPropagation(); deleteSegment(seg.id); });

        item.appendChild(cardBody);
        item.appendChild(deleteBtn);

        item.addEventListener('click', () => {
            // Seek video to segment start
            const vid = document.getElementById('segmentPlayer') || document.getElementById('videoPlayer');
            if (vid) { vid.pause(); vid.currentTime = seg.start_time; }
            // Highlight range on track
            if (window.highlightSegmentOnTrack) window.highlightSegmentOnTrack(seg.start_time, seg.end_time);
            // Mark card as active
            document.querySelectorAll('.segment-item.active').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        });
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
    if (disp) disp.textContent = `${t('segmentStartPrefix')}: ${formatTime(state.segmentStartTime)}`;
    if (window.updateSegmentSliderUI) window.updateSegmentSliderUI();
}

function setSegmentEnd() {
    const segPlayer = document.getElementById('segmentPlayer');
    const videoPlayer = (segPlayer && segPlayer.readyState > 0) ? segPlayer : document.getElementById('videoPlayer');
    if (!videoPlayer || isNaN(videoPlayer.currentTime)) return;
    state.segmentEndTime = videoPlayer.currentTime;
    const disp = document.getElementById('segmentEndDisplay');
    if (disp) disp.textContent = `${t('segmentEndPrefix')}: ${formatTime(state.segmentEndTime)}`;
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

function startInlineRename(nameSpan, seg) {
    const original = seg.name || `Segment ${seg.id}`;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'segment-card-name-input';
    input.value = original;

    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = async () => {
        if (committed) return;
        committed = true;
        const newName = input.value.trim() || original;
        input.replaceWith(nameSpan);
        if (newName !== original) {
            nameSpan.textContent = newName;
            await renameSegment(seg.id, newName);
        }
    };
    const cancel = () => {
        if (committed) return;
        committed = true;
        input.replaceWith(nameSpan);
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
}

async function renameSegment(id, newName) {
    try {
        const resp = await fetch(`${API_BASE}/api/segments/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        if (!resp.ok) throw new Error('Update failed');
        // Update local state so selector and modal reflect the new name without full reload
        const seg = state.segments.find(s => s.id === id);
        if (seg) seg.name = newName;
        refreshSegmentSelector();
        showToast('Renamed', 'Segment name updated', 'success');
    } catch (err) {
        console.error(err);
        showToast('Error', 'Failed to rename segment', 'error');
        // Re-render to restore old name
        renderSegments();
    }
}

async function loadProjects() {
    try {
        const response = await fetch(`${API_BASE}/api/projects`);
        if (!response.ok) throw new Error('Failed to load projects');

        state.projects = await response.json();
        renderProjects();
        showSiloBannerIfNeeded(state.projects);
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

async function loadManagedCohorts() {
    try {
        const resp = await fetch(`${API_BASE}/api/cohorts/managed`, {
            headers: { 'Authorization': `Bearer ${MOODLE_JWT}` }
        });
        if (resp.ok) {
            state.managedCohorts = await resp.json();
        }
    } catch (e) {
        console.warn('Could not load managed cohorts:', e);
    }
}

function renderCohortSelector(selectedCohortId) {
    const contactEmail = state.siloContactEmail || 'your Moodle administrator';
    if (state.managedCohorts.length === 0) {
        return `<div class="silo-notice">
            <p>You are not currently assigned as a teacher in any cohort-enrolled course.
            If your work should be protected from other organisations' search results in
            CraftPilot, please contact
            <a href="mailto:${contactEmail}">${contactEmail}</a>
            to have the correct role assigned. Until then, your annotations will be
            visible to all authenticated users.</p>
        </div>`;
    }
    const options = state.managedCohorts.map(c =>
        `<option value="${c.cohort_id}" ${selectedCohortId === c.cohort_id ? 'selected' : ''}>
            ${c.cohort_name} only
        </option>`
    ).join('');
    return `<label for="project-cohort">Visibility</label>
        <select id="project-cohort" name="allowed_cohort_id">
            <option value="" ${!selectedCohortId ? 'selected' : ''}>
                Open access — visible to all authenticated CraftPilot users
            </option>
            ${options}
        </select>`;
}

function showSiloBannerIfNeeded(projects) {
    const dismissed = localStorage.getItem('craftpilot_silo_banner_dismissed');
    if (dismissed) return;
    if (state.managedCohorts.length === 0) return;

    const unsecured = projects.filter(p => p.allowed_cohort_id == null);
    if (unsecured.length === 0) return;

    // Remove any existing banner before adding a new one
    const existing = document.querySelector('.silo-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.className = 'silo-banner';
    banner.innerHTML = `
        <p>You have <strong>${unsecured.length} project(s)</strong> whose annotations are
        currently visible to all authenticated CraftPilot users. If this content contains
        proprietary knowledge, open each project's settings to assign it to a cohort.</p>
        <button id="silo-banner-dismiss">Don't show me again</button>
    `;
    const grid = document.getElementById('projectsGrid');
    if (grid) grid.prepend(banner);
    document.getElementById('silo-banner-dismiss').addEventListener('click', () => {
        localStorage.setItem('craftpilot_silo_banner_dismissed', '1');
        banner.remove();
    });
}

function openProjectModal(projectId = null) {
    const modal = document.getElementById('projectModal');
    const title = document.getElementById('projectModalTitle');
    const form = document.getElementById('projectForm');
    const nameInput = document.getElementById('projectName');
    const descInput = document.getElementById('projectDescription');

    let selectedCohortId = null;

    if (projectId) {
        // Edit mode
        const project = state.projects.find(p => p.id === projectId);
        if (!project) return;

        state.editingProjectId = projectId;
        title.textContent = 'Edit Project';
        nameInput.value = project.name;
        descInput.value = project.description || '';
        selectedCohortId = project.allowed_cohort_id || null;
    } else {
        // Create mode
        state.editingProjectId = null;
        title.textContent = 'Create Project';
        form.reset();
    }

    // Inject cohort selector after description field
    let cohortGroup = document.getElementById('projectCohortGroup');
    if (!cohortGroup) {
        cohortGroup = document.createElement('div');
        cohortGroup.id = 'projectCohortGroup';
        cohortGroup.className = 'form-group';
        const modalActions = form.querySelector('.modal-actions');
        form.insertBefore(cohortGroup, modalActions);
    }
    cohortGroup.innerHTML = renderCohortSelector(selectedCohortId);

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
        const cohortSelect = document.getElementById('project-cohort');
        const allowed_cohort_id = cohortSelect && cohortSelect.value
            ? parseInt(cohortSelect.value, 10)
            : null;
        const payload = { name, description, allowed_cohort_id };
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

async function renameVideo(videoId) {
    const video = state.videos.find(v => v.id === videoId);
    if (!video) return;

    const current = (video.display_name && video.display_name.trim()) ? video.display_name : '';
    const next = prompt(t('renameVideoPrompt'), current);
    if (next === null) return;

    const trimmed = next.trim();
    if (trimmed === current) return;

    try {
        const response = await fetch(`${API_BASE}/api/videos/${videoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ display_name: trimmed })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(errText || 'rename failed');
        }

        const updated = await response.json();
        const idx = state.videos.findIndex(v => v.id === videoId);
        if (idx !== -1) state.videos[idx] = { ...state.videos[idx], display_name: updated.display_name };
        if (state.currentVideoId === videoId && state.currentVideo) {
            state.currentVideo.display_name = updated.display_name;
            const nameEl = document.getElementById('videoName');
            if (nameEl) nameEl.textContent = updated.display_name || updated.filename;
        }

        showVideoModal();
        showToast(t('toastSuccess'), t('renameSuccess'), 'success');
    } catch (error) {
        console.error('Error renaming video:', error);
        showToast(t('toastError'), t('renameFailed'), 'error');
    }
}

async function deleteVideo(videoId) {
    const video = state.videos.find(v => v.id === videoId);
    const name = video ? video.filename : `ID ${videoId}`;

    if (!confirm(`Delete video "${name}" and ALL its elicitations? This cannot be undone.`)) {
        return;
    }

    try {
        showLoading('Removing video...');

        const response = await fetch(`${API_BASE}/api/videos/${videoId}`, { method: 'DELETE' });

        if (!response.ok) {
            // 404 means the record is already gone — treat as success
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
            document.getElementById('videoSelector').style.display = 'block';
            document.getElementById('videoInfo').style.display = 'none';
        }

        await loadVideos();
        showVideoModal();
        showToast('Removed', 'Video and elicitations deleted', 'success');
    } catch (error) {
        console.error('Error deleting video:', error);
        showToast('Error', 'Failed to delete video', 'error');
    } finally {
        hideLoading();
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
window.cancelInPlaceQA = cancelInPlaceQA;
window.toggleInPlaceRecording = toggleInPlaceRecording;
window.skipInPlaceQuestion = skipInPlaceQuestion;
window.finishInPlaceQA = finishInPlaceQA;
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
window.toggleAppendRecording = toggleAppendRecording;
window.retranscribeAnnotation = retranscribeAnnotation;

// =============================================================================
// TUTORIAL / HELP SYSTEM
// =============================================================================

const TUTORIAL_MARKDOWN = `
# Bienvenue dans l'outil d'élicitation vidéo

Cet outil a été conçu dans le cadre du projet **ReSOuRCE** pour capturer et préserver les savoirs experts des artisans. Vous allez pouvoir commenter vos propres vidéos à la voix, et un système d'intelligence artificielle vous aidera à structurer et enrichir vos commentaires.

---

## 1. Uploader une vidéo

Vos vidéos sont stockées de façon sécurisée sur les serveurs de Mines Paris. Cliquez sur **"Déposer une vidéo"** pour ajouter une nouvelle vidéo, puis **"Choisir une vidéo"** pour la charger dans le lecteur.

**Format accepté :** MP4, MOV, AVI, WebM (jusqu'à 5 Go par fichier).

**Étapes pour uploader une vidéo :**
1. Cliquez sur **"Déposer une vidéo"** dans la barre du haut.
2. Sélectionnez votre fichier vidéo depuis votre ordinateur.
3. La barre de progression indique l'avancement. Attendez le message **"Upload complete !"** avant de continuer.

---

## 2. Sélectionner une vidéo

Une fois votre vidéo uploadée, cliquez sur **"Choisir une vidéo"** dans la barre du haut.

- La fenêtre affiche vos vidéos disponibles.
- Cliquez sur une vidéo pour la charger dans le lecteur.
- L'icône corbeille retire la vidéo du plugin.

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
    // Persist server-side so the flag survives across browsers and iframe storage restrictions
    fetch(`${API_BASE}/api/tutorial-seen`, { method: 'POST' }).catch(() => {});
}

/**
 * Auto-open tutorial for first-time users.
 * Checks server-side flag so the decision survives browser resets and iframe storage restrictions.
 */
async function maybeShowTutorialForNewcomer() {
    try {
        const resp = await fetch(`${API_BASE}/api/tutorial-status`);
        if (!resp.ok) return; // Non-blocking — fail silently
        const { seen } = await resp.json();
        if (seen) return;
        openTutorialModal();
    } catch (e) {
        // Non-blocking — ignore errors silently
    }
}

// ============================================================================
// Coverage module — Quoi / Comment / Pourquoi tracking via spaCy backend
// Stateless backend; all per-annotation scores live in state.coverage here.
// ============================================================================

state.coverage = {
    // { [annotationId]: { quoi: {hits, per_100_tok, status}, comment: {...}, pourquoi: {...}, token_count } }
    scores: {},
    aggregate: null,
    plateau: false,
    summaryOpen: false,
};

const COVERAGE_PHASES = ['quoi', 'comment', 'pourquoi'];

async function _coverageScoreTranscript(transcript) {
    const resp = await fetch(`${API_BASE}/api/coverage/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(MOODLE_JWT ? { 'Authorization': `Bearer ${MOODLE_JWT}` } : {}) },
        body: JSON.stringify({ transcript }),
    });
    if (!resp.ok) throw new Error(`score ${resp.status}`);
    return resp.json();
}

async function _coverageAggregate(scoresList) {
    const resp = await fetch(`${API_BASE}/api/coverage/aggregate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(MOODLE_JWT ? { 'Authorization': `Bearer ${MOODLE_JWT}` } : {}) },
        body: JSON.stringify({ per_annotation_scores: scoresList }),
    });
    if (!resp.ok) throw new Error(`aggregate ${resp.status}`);
    return resp.json();
}

async function _coverageSummary(transcript, phase_scores) {
    const resp = await fetch(`${API_BASE}/api/coverage/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(MOODLE_JWT ? { 'Authorization': `Bearer ${MOODLE_JWT}` } : {}) },
        body: JSON.stringify({ transcript, phase_scores }),
    });
    if (!resp.ok) throw new Error(`summary ${resp.status}`);
    return resp.json();
}

// Score any annotation whose transcript is present and unscored. Called after
// loadAnnotations renders. Chronological order matters for plateau detection.
async function updateCoverageForAnnotations() {
    if (!state.annotations || state.annotations.length === 0) {
        state.coverage.scores = {};
        state.coverage.aggregate = null;
        state.coverage.plateau = false;
        renderCoverageBanner();
        return;
    }

    const sorted = [...state.annotations].sort((a, b) =>
        new Date(a.created_at || 0) - new Date(b.created_at || 0));

    for (const ann of sorted) {
        const txt = (ann.transcription || '').trim();
        if (!txt) continue;
        if (state.coverage.scores[ann.id]) continue;
        try {
            state.coverage.scores[ann.id] = await _coverageScoreTranscript(txt);
        } catch (e) {
            console.warn('coverage score failed', ann.id, e);
        }
    }

    const orderedScores = sorted
        .map(a => state.coverage.scores[a.id])
        .filter(Boolean);

    if (orderedScores.length === 0) {
        state.coverage.aggregate = null;
        state.coverage.plateau = false;
    } else {
        try {
            const { aggregate, plateau } = await _coverageAggregate(orderedScores);
            state.coverage.aggregate = aggregate;
            state.coverage.plateau = !!plateau;
        } catch (e) {
            console.warn('coverage aggregate failed', e);
        }
    }

    renderCoverageBanner();
    // Re-render cards so per-annotation coverage panels pick up the new
    // scores (the first render happened before scores arrived).
    renderAnnotations();
    renderAnnotationPips();
}

function renderCoverageBanner() {
    const banner = document.getElementById('coverageBanner');
    if (!banner) return;
    const agg = state.coverage.aggregate;

    if (!agg) {
        banner.style.display = 'none';
        return;
    }
    banner.style.display = '';

    COVERAGE_PHASES.forEach(p => {
        const phase = agg[p] || { hits: 0, status: 'absent' };
        const chip = banner.querySelector(`.phase-chip[data-phase="${p}"] .phase-dot`);
        if (chip) chip.setAttribute('data-status', phase.status || 'absent');
        const hits = document.getElementById(`phaseHits-${p}`);
        if (hits) hits.textContent = String(phase.hits || 0);
    });

    const anyPartial = COVERAGE_PHASES.some(p => (agg[p] || {}).status && agg[p].status !== 'absent');
    const finishBtn = document.getElementById('finishSessionBtn');
    if (finishBtn) finishBtn.style.display = anyPartial ? '' : 'none';

    const indicator = document.getElementById('coverageRecordingIndicator');
    if (indicator) {
        const isRecording = !!(state.appendMode && state.appendMode.annotationId);
        indicator.style.display = isRecording ? '' : 'none';
    }
}

function stopActiveAppendRecording() {
    const id = state.appendMode && state.appendMode.annotationId;
    if (id != null) toggleAppendRecording(id);
}

function renderAnnotationPips() {
    document.querySelectorAll('.annotation-item').forEach(el => {
        const id = parseInt(el.dataset.id, 10);
        if (!id) return;
        el.querySelectorAll('.annotation-pips').forEach(n => n.remove());
        const s = state.coverage.scores[id];
        if (!s) return;

        const pips = document.createElement('span');
        pips.className = 'annotation-pips';
        COVERAGE_PHASES.forEach(p => {
            const status = (s[p] || {}).status || 'absent';
            const hits = (s[p] || {}).hits || 0;
            const dot = document.createElement('span');
            dot.className = 'annotation-pip';
            dot.setAttribute('data-status', status);
            dot.title = `${p}: ${hits} (${status})`;
            pips.appendChild(dot);
        });

        const header = el.querySelector('.annotation-header, .annotation-meta, h3, h4') || el.firstElementChild;
        if (header) header.appendChild(pips);
        else el.appendChild(pips);
    });
}

async function onFinishSessionClick() {
    const agg = state.coverage.aggregate;
    if (!agg) return;

    const sorted = [...state.annotations].sort((a, b) =>
        new Date(a.created_at || 0) - new Date(b.created_at || 0));
    const transcript = sorted
        .map(a => (a.transcription || '').trim())
        .filter(Boolean)
        .join('\n\n');
    if (!transcript) {
        showToast('Synthèse', 'Aucune transcription à résumer.', 'warning');
        return;
    }

    const phase_scores = {};
    COVERAGE_PHASES.forEach(p => {
        const s = agg[p] || {};
        phase_scores[p] = {
            hits: s.hits || 0,
            per_100_tok: s.per_100_tok || 0,
            status: s.status || 'absent',
        };
    });

    const btn = document.getElementById('finishSessionBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('coverageSummarizing')}`; }

    try {
        const res = await _coverageSummary(transcript, phase_scores);
        renderSessionSummary(res);
    } catch (e) {
        showToast('Synthèse', `Erreur: ${e.message}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-chart-bar"></i> <span data-i18n="coverageFinishSession">${t('coverageFinishSession')}</span>`; }
    }
}

function renderSessionSummary({ summary, weakest_phase, follow_ups }) {
    const card = document.getElementById('sessionSummaryCard');
    const body = document.getElementById('sessionSummaryBody');
    if (!card || !body) return;
    // Cache so refreshDynamicUIStrings() can re-render on language switch.
    state.coverage.lastSummary = { summary, weakest_phase, follow_ups };

    let html = `<div class="summary-text">${escapeHtml(summary || '')}</div>`;
    if (follow_ups && follow_ups.length) {
        const weakTag = weakest_phase
            ? `<span class="weakest-tag">${escapeHtml(weakest_phase)}</span>`
            : '';
        html += `<div class="followups-label">${t('coverageFollowUpsLabel')} ${weakTag}</div>`;
        html += `<ul class="followups">${
            follow_ups.map(q => `<li>${escapeHtml(q)}</li>`).join('')
        }</ul>`;
    } else {
        html += `<div class="followups-label">${t('coverageSessionComplete')}</div>`;
    }
    body.innerHTML = html;
    const modal = document.getElementById('sessionSummaryModal');
    if (modal) modal.style.display = '';
    state.coverage.summaryOpen = true;
}

function hideSessionSummary() {
    const modal = document.getElementById('sessionSummaryModal');
    if (modal) modal.style.display = 'none';
    state.coverage.summaryOpen = false;
}

// Wire buttons once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const finishBtn = document.getElementById('finishSessionBtn');
    if (finishBtn) finishBtn.addEventListener('click', onFinishSessionClick);
    const closeBtn = document.getElementById('sessionSummaryCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', hideSessionSummary);
    const modal = document.getElementById('sessionSummaryModal');
    if (modal) modal.addEventListener('click', e => {
        if (e.target === modal) hideSessionSummary();
    });
});

// ============================================================================
// Per-annotation coverage panel — replaces the legacy review-panel.
// Shows three phase rows (Quoi/Comment/Pourquoi) with status + hit count,
// the transcript with matched markers highlighted, and a one-line hint for
// absent phases.  Everything below is deterministic (spaCy); no LLM per
// annotation.  The session-level summary (LLM) is still driven from the
// "Finir la session" button in the top banner.
// ============================================================================

// Phase labels are domain terms (Quoi/Comment/Pourquoi) — kept in French in
// both locales on purpose. Hints and status labels translate.
const COVERAGE_PHASE_META = {
    quoi:     { label: 'Quoi',     hintKey: 'coverageHintQuoi' },
    comment:  { label: 'Comment',  hintKey: 'coverageHintComment' },
    pourquoi: { label: 'Pourquoi', hintKey: 'coverageHintPourquoi' },
};

function coverageStatusLabel(status) {
    switch (status) {
        case 'absent': return t('coverageStatusAbsent');
        case 'partial': return t('coverageStatusPartial');
        case 'covered': return t('coverageStatusCovered');
        default: return status;
    }
}

function renderCoveragePanel(annotation) {
    // Only makes sense once we have a transcript.
    if (annotation.transcription_status !== 'completed' || !annotation.transcription) {
        return '';
    }

    const score = state.coverage.scores[annotation.id];
    // Score may not have arrived yet (async). Show a loading shell so the
    // panel slot is stable across renders.
    if (!score) {
        return `
            <div class="coverage-panel-container">
                <div class="coverage-toggle-header coverage-toggle-header--loading">
                    <span class="coverage-toggle-label">
                        <i class="fa-solid fa-wave-square"></i>
                        ${t('coverageAnalyzing')}
                    </span>
                </div>
            </div>`;
    }

    const panelOpen = !!state.showReviewPanels[annotation.id];

    // Worst phase drives the headline status chip on the toggle.
    const order = { absent: 0, partial: 1, covered: 2 };
    let worstStatus = 'covered';
    COVERAGE_PHASES.forEach(p => {
        const s = (score[p] || {}).status || 'absent';
        if (order[s] < order[worstStatus]) worstStatus = s;
    });

    const rowsHTML = COVERAGE_PHASES.map(p => {
        const s = score[p] || { hits: 0, status: 'absent' };
        const label = COVERAGE_PHASE_META[p].label;
        const hint = s.status === 'absent' ? t(COVERAGE_PHASE_META[p].hintKey) : '';
        return `
            <div class="coverage-row" data-phase="${p}" data-status="${s.status}">
                <span class="coverage-row-dot" data-status="${s.status}"></span>
                <span class="coverage-row-label">${label}</span>
                <span class="coverage-row-status">${coverageStatusLabel(s.status)}</span>
                <span class="coverage-row-hits">${s.hits}</span>
                ${hint ? `<div class="coverage-row-hint">${escapeHtml(hint)}</div>` : ''}
            </div>`;
    }).join('');

    const highlighted = highlightTranscript(annotation.transcription, score.markers || {});

    return `
        <div class="coverage-panel-container">
            <div class="coverage-toggle-header" onclick="toggleReviewPanel(${annotation.id})">
                <span class="coverage-toggle-label">
                    <i class="fa-solid fa-wave-square"></i>
                    Quoi / Comment / Pourquoi
                    <span class="coverage-chip" data-status="${worstStatus}">${coverageStatusLabel(worstStatus)}</span>
                </span>
                <span class="coverage-toggle-indicator">
                    <i class="fa-solid fa-chevron-${panelOpen ? 'up' : 'down'}"></i>
                </span>
            </div>
            <div class="coverage-panel ${panelOpen ? 'visible' : ''}" id="coverage-panel-${annotation.id}">
                <div class="coverage-rows">${rowsHTML}</div>
                <div class="coverage-transcript-label">${t('coverageTranscriptLabel')}</div>
                <div class="coverage-transcript">${highlighted}</div>
                ${renderCoveragePanelActions(annotation, score)}
            </div>
        </div>`;
}

// Build an HTML string where marker spans are wrapped in <mark> tags colored
// by phase. Markers are already char-offset based, so we slice the raw
// transcript and interleave escaped chunks with escaped marker text.
function highlightTranscript(transcript, markers) {
    if (!transcript) return '';

    // Collect (start, end, phase) triples; sort + resolve overlaps by giving
    // priority to the longest span, then to pourquoi > comment > quoi (why is
    // usually the most informative marker).
    const prio = { pourquoi: 2, comment: 1, quoi: 0 };
    const all = [];
    COVERAGE_PHASES.forEach(phase => {
        (markers[phase] || []).forEach(m => {
            if (typeof m.char_start === 'number' && typeof m.char_end === 'number') {
                all.push({ start: m.char_start, end: m.char_end, phase });
            }
        });
    });

    all.sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        const lenDiff = (b.end - b.start) - (a.end - a.start);
        if (lenDiff !== 0) return lenDiff;
        return prio[b.phase] - prio[a.phase];
    });

    // Drop overlaps: skip any span that starts before the previous one ended.
    const nonOverlapping = [];
    let cursor = -1;
    for (const m of all) {
        if (m.start >= cursor) {
            nonOverlapping.push(m);
            cursor = m.end;
        }
    }

    if (nonOverlapping.length === 0) {
        return escapeHtml(transcript);
    }

    let out = '';
    let idx = 0;
    for (const m of nonOverlapping) {
        if (m.start > idx) out += escapeHtml(transcript.slice(idx, m.start));
        out += `<mark class="phase-mark phase-mark--${m.phase}">${escapeHtml(transcript.slice(m.start, m.end))}</mark>`;
        idx = m.end;
    }
    if (idx < transcript.length) out += escapeHtml(transcript.slice(idx));
    return out;
}

// ============================================================================
// Weak-annotation signalling + redo actions
// Weak = transcription completed AND either all three phases absent, OR the
// transcript is shorter than COVERAGE_MIN_TOKENS. Unknown (no score yet) is
// NOT weak — avoids flashing the badge on cards mid-scoring.
// ============================================================================

const COVERAGE_MIN_TOKENS = 10;

function isAnnotationWeak(annotation) {
    if (!annotation) return false;
    if (annotation.transcription_status !== 'completed') return false;

    const s = state.coverage && state.coverage.scores && state.coverage.scores[annotation.id];
    if (!s) return false;

    const allAbsent = COVERAGE_PHASES.every(p => ((s[p] || {}).status || 'absent') === 'absent');
    const tooShort = (s.token_count || 0) < COVERAGE_MIN_TOKENS;
    return allAbsent || tooShort;
}

// Actions row inside the coverage panel: shown only when at least one phase
// is absent (i.e. there is still ground to cover on this segment).
function renderCoveragePanelActions(annotation, score) {
    const anyAbsent = COVERAGE_PHASES.some(p => ((score[p] || {}).status || 'absent') === 'absent');
    if (!anyAbsent) return '';

    const isAppending = state.appendMode && state.appendMode.annotationId === annotation.id;
    const appendLabel = isAppending
        ? `<i class="fa-solid fa-stop"></i> ${t('coverageAppendStop')}`
        : `<i class="fa-solid fa-microphone-lines"></i> ${t('coverageAppendRecord')}`;
    const appendClass = isAppending
        ? 'coverage-action-btn coverage-action-btn--recording'
        : 'coverage-action-btn';

    return `
        <div class="coverage-actions">
            <span class="coverage-actions-hint">${t('coverageActionsHint')}</span>
            <div class="coverage-actions-buttons">
                <button class="btn btn-small ${appendClass}" id="append-btn-${annotation.id}" onclick="event.stopPropagation(); toggleAppendRecording(${annotation.id})" title="${escapeHtml(t('coverageAppendTitle'))}">
                    ${appendLabel}
                </button>
            </div>
        </div>`;
}

async function retranscribeAnnotation(annotationId) {
    if (!confirm(t('coverageRetranscribeConfirm'))) return;
    try {
        const resp = await fetch(`${API_BASE}/api/annotations/${annotationId}/retranscribe`, {
            method: 'POST',
            headers: MOODLE_JWT ? { 'Authorization': `Bearer ${MOODLE_JWT}` } : {},
        });
        if (!resp.ok) throw new Error(await resp.text());
        // Drop cached score so the next coverage refresh rescores against the
        // new transcript once WS signals completion.
        if (state.coverage && state.coverage.scores) {
            delete state.coverage.scores[annotationId];
        }
        showToast('Transcription', 'Re-transcription en cours…', 'info');
    } catch (e) {
        showToast('Erreur', `Re-transcription: ${e.message}`, 'error');
    }
}

async function toggleAppendRecording(annotationId) {
    const mode = state.appendMode;

    // Already recording for this annotation → stop + transcribe + append.
    if (mode.annotationId === annotationId && mode.mediaRecorder) {
        try {
            mode.mediaRecorder.stop();
        } catch (_) { /* ignore */ }
        return;
    }

    // Already recording for a *different* annotation — block to avoid confusion.
    if (mode.annotationId && mode.annotationId !== annotationId) {
        showToast('Enregistrement', 'Un autre complément est déjà en cours.', 'warning');
        return;
    }

    const ann = state.annotations.find(a => a.id === annotationId);
    if (!ann) return;

    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        showToast('Erreur micro', 'Impossible d\'accéder au microphone', 'error');
        return;
    }

    const recorder = new MediaRecorder(stream);
    mode.annotationId = annotationId;
    mode.mediaRecorder = recorder;
    mode.mimeType = recorder.mimeType || 'audio/webm';
    mode.chunks = [];
    mode.stream = stream;

    recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) mode.chunks.push(e.data);
    };

    recorder.onstop = async () => {
        const chunks = mode.chunks.slice();
        try { stream.getTracks().forEach(t => t.stop()); } catch (_) {}
        mode.annotationId = null;
        mode.mediaRecorder = null;
        mode.chunks = [];
        mode.stream = null;
        renderCoverageBanner();

        // Show processing state on the button.
        const btn = document.getElementById(`append-btn-${annotationId}`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Transcription…';
        }

        try {
            const actualMime = mode.mimeType || 'audio/webm';
            const appendExt = actualMime.startsWith('audio/ogg') ? 'ogg' : 'webm';
            const blob = new Blob(chunks, { type: actualMime });
            const form = new FormData();
            form.append('audio_blob', blob, `append.${appendExt}`);
            const headers = {};
            if (MOODLE_JWT) headers['Authorization'] = `Bearer ${MOODLE_JWT}`;

            const resp = await fetch(`${API_BASE}/api/annotations/transcribe-only`, {
                method: 'POST', headers, body: form,
            });
            if (!resp.ok) throw new Error(await resp.text());
            const data = await resp.json();
            const addition = (data.transcription || '').trim();
            if (!addition) {
                showToast('Transcription', 'Aucune parole détectée.', 'warning');
                renderAnnotations();
                return;
            }

            const current = state.annotations.find(a => a.id === annotationId);
            const existing = (current && current.transcription ? current.transcription.trim() : '');
            const combined = existing ? (existing + '\n\n' + addition) : addition;

            await saveElicitationEdit(annotationId, combined);
            // saveElicitationEdit invalidates coverage + re-renders.
            showToast('Transcription', 'Complément ajouté.', 'success');
        } catch (e) {
            showToast('Erreur', `Ajout: ${e.message}`, 'error');
            renderAnnotations();
        }
    };

    recorder.start();
    renderCoverageBanner();
    renderAnnotations();
}
