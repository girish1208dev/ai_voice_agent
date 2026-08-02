/**
 * Divyasree AI Voice Consultant — Client Application
 * Handles UI state, microphone capture, WebSocket communication,
 * and audio playback for the AI voice agent.
 */

// ==========================================
// DOM Elements
// ==========================================
const elements = {
  // Call controls
  callButton: document.getElementById('call-button'),
  callButtonText: document.getElementById('call-button-text'),
  callButtonIcon: document.getElementById('call-button-icon'),
  callTimer: document.getElementById('call-timer'),
  timerText: document.getElementById('timer-text'),

  // Status
  statusRing: document.getElementById('status-ring'),
  statusText: document.getElementById('status-text'),

  // Icons
  iconMic: document.getElementById('icon-mic'),
  iconListening: document.getElementById('icon-listening'),
  iconSpeaking: document.getElementById('icon-speaking'),
  iconEnded: document.getElementById('icon-ended'),



  // Modal
  micModal: document.getElementById('mic-modal'),
  micModalCancel: document.getElementById('mic-modal-cancel'),
  micModalAllow: document.getElementById('mic-modal-allow'),

  // Toast
  errorToast: document.getElementById('error-toast'),
  toastMessage: document.getElementById('toast-message'),
  toastClose: document.getElementById('toast-close'),
};

// ==========================================
// State
// ==========================================
const state = {
  callActive: false,
  callState: 'idle', // idle | connecting | listening | thinking | speaking | ended
  ws: null,
  mediaStream: null,
  audioContext: null,
  mediaRecorder: null,
  timerInterval: null,
  callStartTime: null,
  toastTimeout: null,
  thinkingTimeout: null,
  userSpeaking: false,

  // Audio playback queue
  audioQueue: [],
  isPlaying: false,
};

// ==========================================
// Constants
// ==========================================
// WebSocket URL — will be set based on environment
const WS_URL = getWebSocketUrl();

function getWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:3001';
  return `${protocol}//${host}/ws`;
}

// ==========================================
// UI State Management
// ==========================================
function setCallState(newState) {
  state.callState = newState;

  // Reset all icons
  [elements.iconMic, elements.iconListening, elements.iconSpeaking, elements.iconEnded]
    .forEach(icon => icon.classList.remove('active'));

  // Reset ring classes
  elements.statusRing.className = 'status-ring';

  // Clear any pending thinking timeout
  if (state.thinkingTimeout) {
    clearTimeout(state.thinkingTimeout);
    state.thinkingTimeout = null;
  }

  switch (newState) {
    case 'idle':
      elements.iconMic.classList.add('active');
      elements.statusText.textContent = '';
      elements.callButton.className = 'call-button';
      elements.callButtonText.textContent = 'Answer Call';
      elements.callButtonIcon.innerHTML = getPhoneIcon();
      elements.callTimer.classList.remove('visible');
      break;

    case 'connecting':
      elements.iconMic.classList.add('active');
      elements.statusRing.classList.add('connecting');
      elements.statusText.textContent = 'Connecting...';
      elements.callButton.className = 'call-button end-call';
      elements.callButtonText.textContent = 'Cancel';
      elements.callButtonIcon.innerHTML = getPhoneOffIcon();
      break;

    case 'listening':
      elements.iconListening.classList.add('active');
      elements.statusRing.classList.add('listening');
      elements.statusText.textContent = 'Listening...';
      elements.callButton.className = 'call-button end-call';
      elements.callButtonText.textContent = 'End Call';
      elements.callButtonIcon.innerHTML = getPhoneOffIcon();
      elements.callTimer.classList.add('visible');
      break;

    case 'thinking':
      elements.iconMic.classList.add('active');
      elements.statusRing.classList.add('connecting');
      elements.statusText.textContent = 'Thinking...';
      break;

    case 'speaking':
      elements.iconSpeaking.classList.add('active');
      elements.statusRing.classList.add('speaking');
      elements.statusText.textContent = 'Speaking...';
      break;

    case 'ended':
      elements.iconEnded.classList.add('active');
      elements.statusRing.classList.add('ended');
      elements.statusText.textContent = 'Call ended';
      elements.callButton.className = 'call-button';
      elements.callButtonText.textContent = 'Answer Call';
      elements.callButtonIcon.innerHTML = getPhoneIcon();
      elements.callTimer.classList.remove('visible');
      // Auto-reset to idle after 1 second
      setTimeout(() => {
        if (state.callState === 'ended') {
          setCallState('idle');
        }
      }, 1000);
      break;
  }
}

// ==========================================
// SVG Icon Helpers
// ==========================================
function getPhoneIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>`;
}

function getPhoneOffIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/>
    <line x1="23" y1="1" x2="1" y2="23"/>
  </svg>`;
}

// ==========================================
// Call Timer
// ==========================================
function startTimer() {
  state.callStartTime = Date.now();
  state.timerInterval = setInterval(updateTimer, 1000);
  updateTimer();
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function updateTimer() {
  if (!state.callStartTime) return;
  const elapsed = Math.floor((Date.now() - state.callStartTime) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  elements.timerText.textContent = `${minutes}:${seconds}`;
}



// ==========================================
// Toast Notifications
// ==========================================
function showToast(message, duration = 5000) {
  elements.toastMessage.textContent = message;
  elements.errorToast.classList.add('visible');

  if (state.toastTimeout) clearTimeout(state.toastTimeout);
  state.toastTimeout = setTimeout(hideToast, duration);
}

function hideToast() {
  elements.errorToast.classList.remove('visible');
  if (state.toastTimeout) {
    clearTimeout(state.toastTimeout);
    state.toastTimeout = null;
  }
}

// ==========================================
// Microphone Access
// ==========================================
async function requestMicrophoneAccess() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    });
    state.mediaStream = stream;
    return true;
  } catch (err) {
    console.error('Microphone access denied:', err);

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showToast('Microphone access was denied. Please allow microphone access in your browser settings and try again.');
    } else if (err.name === 'NotFoundError') {
      showToast('No microphone found. Please connect a microphone and try again.');
    } else {
      showToast(`Microphone error: ${err.message}`);
    }
    return false;
  }
}

// ==========================================
// Audio Capture (Mic → WebSocket)
// ==========================================
function startAudioCapture() {
  if (!state.mediaStream || !state.ws) return;

  // Create AudioContext for processing
  state.audioContext = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 16000,
  });

  const source = state.audioContext.createMediaStreamSource(state.mediaStream);

  // Use ScriptProcessorNode for raw PCM (simpler approach)
  // In production, use AudioWorklet for better performance
  const processor = state.audioContext.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (e) => {
    if (!state.callActive || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;

    const inputData = e.inputBuffer.getChannelData(0);

    // Detect if user is actively speaking (audio level above threshold)
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sum / inputData.length);
    const isSpeaking = rms > 0.01;

    if (isSpeaking) {
      state.userSpeaking = true;
      // Clear any pending thinking timeout since user is still speaking
      if (state.thinkingTimeout) {
        clearTimeout(state.thinkingTimeout);
        state.thinkingTimeout = null;
      }
    } else if (state.userSpeaking) {
      // User just stopped speaking — start thinking timeout
      state.userSpeaking = false;
      if (!state.thinkingTimeout && state.callState === 'listening') {
        state.thinkingTimeout = setTimeout(() => {
          if (state.callActive && state.callState === 'listening') {
            setCallState('thinking');
          }
          state.thinkingTimeout = null;
        }, 600); // 600ms silence → "Thinking..."
      }
    }

    // Convert float32 PCM to int16 PCM
    const pcm16 = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Convert to base64 and send
    const base64 = arrayBufferToBase64(pcm16.buffer);
    state.ws.send(JSON.stringify({
      type: 'audio',
      data: base64,
    }));
  };

  source.connect(processor);
  processor.connect(state.audioContext.destination);

  state.processor = processor;
  state.source = source;
}

function stopAudioCapture() {
  if (state.processor) {
    state.processor.disconnect();
    state.processor = null;
  }
  if (state.source) {
    state.source.disconnect();
    state.source = null;
  }
  if (state.audioContext) {
    state.audioContext.close().catch(() => {});
    state.audioContext = null;
  }
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(track => track.stop());
    state.mediaStream = null;
  }
}

// ==========================================
// Audio Playback (WebSocket → Speaker)
// ==========================================
function initPlaybackContext() {
  if (!state.playbackContext) {
    state.playbackContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 24000,  // Gemini outputs 24kHz audio
    });
  }
}

async function playAudioChunk(base64Audio) {
  initPlaybackContext();

  const pcmData = base64ToInt16Array(base64Audio);
  const float32Data = new Float32Array(pcmData.length);

  for (let i = 0; i < pcmData.length; i++) {
    float32Data[i] = pcmData[i] / 0x7FFF;
  }

  const audioBuffer = state.playbackContext.createBuffer(1, float32Data.length, 24000);
  audioBuffer.getChannelData(0).set(float32Data);

  const sourceNode = state.playbackContext.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(state.playbackContext.destination);

  return new Promise((resolve) => {
    sourceNode.onended = resolve;
    sourceNode.start();
  });
}

async function processAudioQueue() {
  if (state.isPlaying) return;
  state.isPlaying = true;

  while (state.audioQueue.length > 0) {
    const chunk = state.audioQueue.shift();
    try {
      await playAudioChunk(chunk);
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }

  state.isPlaying = false;

  // If call is still active and we finished playing, switch back to listening
  if (state.callActive && state.callState === 'speaking') {
    setCallState('listening');
  }
}

// ==========================================
// WebSocket Communication
// ==========================================
function connectWebSocket() {
  return new Promise((resolve, reject) => {
    try {
      state.ws = new WebSocket(WS_URL);

      state.ws.onopen = () => {
        console.log('WebSocket connected');
        resolve();
      };

      state.ws.onmessage = (event) => {
        handleServerMessage(event.data);
      };

      state.ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        reject(new Error('Failed to connect to server'));
      };

      state.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        if (state.callActive) {
          endCall(false);
          if (event.code !== 1000) {
            showToast('Connection lost. Please try again.');
          }
        }
      };
    } catch (err) {
      reject(err);
    }
  });
}

function handleServerMessage(data) {
  try {
    const message = JSON.parse(data);

    switch (message.type) {
      case 'session_ready':
        // Server confirmed Gemini session is ready — stay on "Connecting..."
        // until the AI's first audio arrives, then it'll switch to "Speaking..."
        startTimer();
        startAudioCapture();
        break;

      case 'audio':
        // Received audio from Gemini — cancel thinking, switch to speaking
        if (state.callState !== 'speaking') {
          state.userSpeaking = false;
          setCallState('speaking');
        }
        state.audioQueue.push(message.data);
        processAudioQueue();
        break;

      case 'turn_complete':
        // Gemini finished speaking
        if (state.callActive) {
          setCallState('listening');
        }
        break;

      case 'error':
        showToast(message.message || 'An error occurred');
        if (message.fatal) {
          endCall(false);
        }
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  } catch (err) {
    console.error('Failed to parse server message:', err);
  }
}

// ==========================================
// Call Flow
// ==========================================
async function startCall() {
  if (state.callActive) return;

  setCallState('connecting');
  state.callActive = true;

  // Step 1: Request microphone access
  const micGranted = await requestMicrophoneAccess();
  if (!micGranted) {
    state.callActive = false;
    setCallState('idle');
    return;
  }

  // Step 2: Connect WebSocket
  try {
    await connectWebSocket();
  } catch (err) {
    showToast('Unable to connect to the server. Please ensure the server is running.');
    state.callActive = false;
    stopAudioCapture();
    setCallState('idle');
    return;
  }

  // Step 3: Send start signal
  // The server will initialize the Gemini Live session and respond with 'session_ready'
  state.ws.send(JSON.stringify({ type: 'start_session' }));
}

function endCall(sendEndSignal = true) {
  state.callActive = false;

  // Send end signal to server
  if (sendEndSignal && state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'end_session' }));
  }

  // Clean up
  stopAudioCapture();
  stopTimer();

  // Close WebSocket
  if (state.ws) {
    state.ws.close(1000, 'Call ended by user');
    state.ws = null;
  }

  // Clear audio queue
  state.audioQueue = [];
  state.isPlaying = false;

  // Close playback context
  if (state.playbackContext) {
    state.playbackContext.close().catch(() => {});
    state.playbackContext = null;
  }

  setCallState('ended');
}

// ==========================================
// Utility Functions
// ==========================================
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToInt16Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

// ==========================================
// Event Listeners
// ==========================================
function initEventListeners() {
  // Call button
  elements.callButton.addEventListener('click', () => {
    if (!state.callActive && state.callState !== 'connecting') {
      startCall();
    } else {
      endCall();
    }
  });

  // Modal cancel
  elements.micModalCancel.addEventListener('click', () => {
    elements.micModal.classList.remove('visible');
  });

  // Modal allow
  elements.micModalAllow.addEventListener('click', async () => {
    elements.micModal.classList.remove('visible');
    await startCall();
  });

  // Toast close
  elements.toastClose.addEventListener('click', hideToast);

  // Handle page visibility (pause/resume)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.callActive) {
      // Optional: could pause capture when tab is hidden
      console.log('Tab hidden — call continues in background');
    }
  });

  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    if (state.callActive) {
      endCall();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Space bar to toggle call (when not typing in an input)
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      if (!state.callActive && state.callState !== 'connecting') {
        startCall();
      } else if (state.callActive) {
        endCall();
      }
    }

    // Escape to end call
    if (e.code === 'Escape' && state.callActive) {
      endCall();
    }
  });
}

// ==========================================
// Initialization
// ==========================================
function init() {
  initEventListeners();
  setCallState('idle');

  // Check for basic browser support
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Your browser does not support microphone access. Please use a modern browser like Chrome, Firefox, or Edge.');
    elements.callButton.disabled = true;
    elements.callButton.style.opacity = '0.5';
    elements.callButton.style.cursor = 'not-allowed';
  }

  if (!window.WebSocket) {
    showToast('Your browser does not support WebSocket connections. Please use a modern browser.');
    elements.callButton.disabled = true;
    elements.callButton.style.opacity = '0.5';
    elements.callButton.style.cursor = 'not-allowed';
  }

  console.log('Divyasree AI Voice Consultant initialized');
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
