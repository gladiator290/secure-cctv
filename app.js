// ==========================================================
// VANGUARD SECURE CCTV & MONITOR P2P ENGINE (v2.0)
// High-Reliability WebRTC Cloud P2P Streaming Engine
// ==========================================================

(function () {
    'use strict';

    // DOM Elements: PIN Lock
    const pinScreen = document.getElementById('pinScreen');
    const pinTitle = document.getElementById('pinTitle');
    const pinSubtext = document.getElementById('pinSubtext');
    const pinError = document.getElementById('pinError');
    const pinDots = [
        document.getElementById('dot1'),
        document.getElementById('dot2'),
        document.getElementById('dot3'),
        document.getElementById('dot4')
    ];

    // Screens
    const roleScreen = document.getElementById('roleScreen');
    const cctvScreen = document.getElementById('cctvScreen');
    const dashboardScreen = document.getElementById('dashboardScreen');
    const monitorScreen = document.getElementById('monitorScreen');
    const stealthScreen = document.getElementById('stealthScreen');
    const toast = document.getElementById('toast');

    // CCTV Elements
    const cctvVideo = document.getElementById('cctvVideo');
    const cctvCodeBadge = document.getElementById('cctvCodeBadge');
    const cctvQROverlay = document.getElementById('cctvQROverlay');
    const cctvQRImage = document.getElementById('cctvQRImage');
    const cctvCodeText = document.getElementById('cctvCodeText');
    const cctvSecretText = document.getElementById('cctvSecretText');
    const viewerCount = document.getElementById('viewerCount');
    const motionCanvas = document.getElementById('motionCanvas');
    const stealthClock = document.getElementById('stealthClock');
    const cctvResDisplay = document.getElementById('cctvResDisplay');
    const cctvFpsDisplay = document.getElementById('cctvFpsDisplay');

    // Dashboard Elements
    const camerasList = document.getElementById('camerasList');
    const noCamerasCard = document.getElementById('noCamerasCard');
    const pairModal = document.getElementById('pairModal');
    const scannerVideo = document.getElementById('scannerVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const monitorCamName = document.getElementById('monitorCamName');
    const motionBanner = document.getElementById('motionBanner');
    const monitorLoader = document.getElementById('monitorLoader');
    const connectingText = document.getElementById('connectingText');
    const audioIcon = document.getElementById('audioIcon');
    const audioLabel = document.getElementById('audioLabel');

    // State
    let enteredPin = '';
    let settingUpPin = false;
    let wakeLock = null;
    let peer = null;

    // CCTV State
    let cctvStream = null;
    let cctvCameraCode = null;
    let cctvSecret = null;
    let cctvFacingMode = 'environment';
    let cctvTorchOn = false;
    let activeCalls = new Map();         // peerId => call
    let activeDataConns = new Map();     // peerId => conn
    let motionInterval = null;
    let lastFrameData = null;

    // Dashboard State
    let pairedCameras = JSON.parse(localStorage.getItem('cctv_paired_cameras') || '[]');
    let activeCamera = null;
    let currentCall = null;
    let currentConn = null;
    let scannerStream = null;
    let scannerScanInterval = null;
    let isMuted = true; // Start muted to guarantee mobile Chrome autoplay

    // High Reliability STUN / TURN configuration
    const peerOptions = {
        debug: 1,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ]
        }
    };

    function getCCTVPeerId(code, secret) {
        const cleanCode = code.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanSecret = secret.toLowerCase().replace(/[^a-z0-9]/g, '');
        return `cctv-${cleanCode}-${cleanSecret}`;
    }

    // ==========================================
    // 1. PIN SECURITY & MASTER AUTH
    // ==========================================
    function checkPinSetup() {
        const storedPin = localStorage.getItem('cctv_master_pin');
        if (!storedPin) {
            settingUpPin = true;
            pinTitle.innerText = 'CREATE PIN';
            pinSubtext.innerText = 'Set a 4-Digit Security Master PIN';
        } else {
            settingUpPin = false;
            pinTitle.innerText = 'SECURE CCTV';
            pinSubtext.innerText = 'Enter 4-Digit Security Master PIN';
        }
        showPinScreen();
    }

    function showPinScreen() {
        enteredPin = '';
        updatePinDots();
        pinError.innerText = '';
        pinScreen.classList.add('active');
    }

    function hidePinScreen() {
        pinScreen.classList.remove('active');
    }

    function updatePinDots() {
        pinDots.forEach((dot, index) => {
            if (index < enteredPin.length) {
                dot.classList.add('filled');
            } else {
                dot.classList.remove('filled');
            }
        });
    }

    function handlePinInput(val) {
        if (enteredPin.length < 4) {
            enteredPin += val;
            updatePinDots();
            if (enteredPin.length === 4) {
                setTimeout(verifyPin, 150);
            }
        }
    }

    function verifyPin() {
        const storedPin = localStorage.getItem('cctv_master_pin');
        if (settingUpPin) {
            localStorage.setItem('cctv_master_pin', enteredPin);
            showToast('✓ Master PIN saved successfully');
            hidePinScreen();
        } else {
            if (enteredPin === storedPin) {
                hidePinScreen();
                if (stealthScreen.classList.contains('active')) {
                    exitStealthMode();
                }
            } else {
                pinError.innerText = 'Incorrect PIN! Try again.';
                enteredPin = '';
                updatePinDots();
            }
        }
    }

    document.querySelectorAll('.num-key[data-val]').forEach(btn => {
        btn.addEventListener('click', () => handlePinInput(btn.getAttribute('data-val')));
    });

    document.getElementById('btnPinBackspace').addEventListener('click', () => {
        if (enteredPin.length > 0) {
            enteredPin = enteredPin.slice(0, -1);
            updatePinDots();
            pinError.innerText = '';
        }
    });

    document.getElementById('btnPinClear').addEventListener('click', () => {
        enteredPin = '';
        updatePinDots();
        pinError.innerText = '';
    });

    document.getElementById('btnLockApp').addEventListener('click', () => {
        showPinScreen();
    });

    // ==========================================
    // 2. NAVIGATION & UI HELPERS
    // ==========================================
    function showScreen(screen) {
        [roleScreen, cctvScreen, dashboardScreen, monitorScreen].forEach(s => s.classList.remove('active'));
        screen.classList.add('active');
    }

    function showToast(msg, duration = 3000) {
        toast.innerText = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    }

    document.getElementById('btnStartCCTVMode').addEventListener('click', startCCTVMode);
    document.getElementById('btnStartDashboardMode').addEventListener('click', startDashboardMode);
    document.getElementById('btnBackToRoleFromDash').addEventListener('click', () => showScreen(roleScreen));
    document.getElementById('btnBackFromMonitor').addEventListener('click', exitMonitorMode);

    // ==========================================
    // 3. CCTV CAMERA MODE (Transmitter Node)
    // ==========================================
    async function startCCTVMode() {
        cctvCameraCode = localStorage.getItem('cctv_camera_code');
        cctvSecret = localStorage.getItem('cctv_camera_secret');

        if (!cctvCameraCode || !cctvSecret) {
            cctvCameraCode = 'CAM-' + Math.floor(1000 + Math.random() * 9000);
            cctvSecret = Math.random().toString(36).substring(2, 8);
            localStorage.setItem('cctv_camera_code', cctvCameraCode);
            localStorage.setItem('cctv_camera_secret', cctvSecret);
        }

        cctvCodeBadge.innerText = cctvCameraCode;
        cctvCodeText.innerText = cctvCameraCode;
        cctvSecretText.innerText = cctvSecret;

        requestWakeLock();

        try {
            await initCCTVCamera();
            initCCTVPeer();
            renderPairingQR();
            startMotionDetection();
            showScreen(cctvScreen);
            showToast('📹 Camera Live & Broadcasting');
        } catch (err) {
            alert('Camera Permission Error: ' + err.message + '\nPlease grant Camera & Microphone permissions.');
            showScreen(roleScreen);
        }
    }

    async function initCCTVCamera() {
        if (cctvStream) {
            cctvStream.getTracks().forEach(t => t.stop());
        }

        const constraints = {
            video: {
                facingMode: cctvFacingMode,
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                frameRate: { ideal: 25, max: 30 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };

        cctvStream = await navigator.mediaDevices.getUserMedia(constraints);
        cctvVideo.srcObject = cctvStream;

        // Telemetry
        const track = cctvStream.getVideoTracks()[0];
        if (track) {
            const s = track.getSettings();
            if (s.width && s.height) {
                cctvResDisplay.innerText = `${s.width}x${s.height}`;
            }
            if (s.frameRate) {
                cctvFpsDisplay.innerText = `${Math.round(s.frameRate)} FPS`;
            }
        }
    }

    function initCCTVPeer() {
        if (peer) {
            try { peer.destroy(); } catch (e) {}
        }

        const peerId = getCCTVPeerId(cctvCameraCode, cctvSecret);
        console.log('[CCTV] Registering Peer ID:', peerId);
        peer = new Peer(peerId, peerOptions);

        peer.on('open', (id) => {
            console.log('[CCTV] Online with Cloud ID:', id);
        });

        // 1. Data Connection Handler: Dashboard sends commands or stream requests
        peer.on('connection', (conn) => {
            console.log('[CCTV] Dashboard connected to data channel:', conn.peer);
            activeDataConns.set(conn.peer, conn);

            conn.on('data', (data) => {
                console.log('[CCTV] Received command:', data);
                if (data.type === 'request_stream') {
                    // Call dashboard with local camera stream!
                    callDashboardWithStream(conn.peer);
                } else if (data.command === 'torch') {
                    toggleTorch(data.value);
                } else if (data.command === 'flip') {
                    flipCCTVCamera();
                } else if (data.command === 'siren') {
                    playSirenAlert();
                } else if (data.command === 'stealth') {
                    enterStealthMode();
                }
            });

            conn.on('close', () => {
                activeDataConns.delete(conn.peer);
                updateViewerCount();
            });

            conn.on('error', () => {
                activeDataConns.delete(conn.peer);
                updateViewerCount();
            });
        });

        // 2. Incoming Call Fallback: If dashboard initiates a call
        peer.on('call', (call) => {
            console.log('[CCTV] Incoming call from dashboard:', call.peer);
            call.answer(cctvStream);
            registerCall(call);
        });

        peer.on('error', (err) => {
            console.warn('[CCTV] Peer error:', err.type, err.message);
            if (err.type === 'unavailable-id') {
                // Generate a fresh secret if collision occurs
                cctvSecret = Math.random().toString(36).substring(2, 8);
                localStorage.setItem('cctv_camera_secret', cctvSecret);
                initCCTVPeer();
            }
        });
    }

    function callDashboardWithStream(dashboardPeerId) {
        if (!peer || !cctvStream) return;
        console.log('[CCTV] Calling dashboard with video stream:', dashboardPeerId);

        const call = peer.call(dashboardPeerId, cctvStream);
        if (call) {
            registerCall(call);
        }
    }

    function registerCall(call) {
        activeCalls.set(call.peer, call);
        updateViewerCount();

        call.on('close', () => {
            activeCalls.delete(call.peer);
            updateViewerCount();
        });

        call.on('error', () => {
            activeCalls.delete(call.peer);
            updateViewerCount();
        });
    }

    function updateViewerCount() {
        const count = Math.max(activeCalls.size, activeDataConns.size);
        viewerCount.innerText = count;
    }

    // Client-side QR generator
    function renderPairingQR() {
        const pairData = JSON.stringify({
            type: 'cctv_pair',
            code: cctvCameraCode,
            secret: cctvSecret,
            name: 'CCTV ' + cctvCameraCode
        });

        if (window.qrcode) {
            try {
                const qr = qrcode(0, 'M');
                qr.addData(pairData);
                qr.make();
                cctvQRImage.src = qr.createDataURL(6);
            } catch (e) {
                console.error('QR Gen error:', e);
            }
        }
    }

    // Remote Camera Controls
    async function toggleTorch(forceState) {
        if (!cctvStream) return;
        const videoTrack = cctvStream.getVideoTracks()[0];
        if (!videoTrack) return;

        const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
        if (capabilities.torch) {
            cctvTorchOn = forceState !== undefined ? forceState : !cctvTorchOn;
            await videoTrack.applyConstraints({
                advanced: [{ torch: cctvTorchOn }]
            });
            showToast(cctvTorchOn ? '🔦 Flashlight ON' : 'Flashlight OFF');
        } else {
            showToast('Torch not supported on this lens');
        }
    }

    async function flipCCTVCamera() {
        cctvFacingMode = cctvFacingMode === 'environment' ? 'user' : 'environment';
        await initCCTVCamera();

        // Update tracks in active calls
        activeCalls.forEach((call) => {
            if (call.peerConnection) {
                const senders = call.peerConnection.getSenders();
                cctvStream.getTracks().forEach(track => {
                    const sender = senders.find(s => s.track && s.track.kind === track.kind);
                    if (sender) sender.replaceTrack(track);
                });
            }
        });
        showToast('🔄 Camera flipped');
    }

    // Motion Detection via Canvas frame difference
    function startMotionDetection() {
        const ctx = motionCanvas.getContext('2d', { willReadFrequently: true });
        motionCanvas.width = 64;
        motionCanvas.height = 48;

        motionInterval = setInterval(() => {
            if (!cctvVideo || cctvVideo.readyState < 2) return;

            ctx.drawImage(cctvVideo, 0, 0, 64, 48);
            const frame = ctx.getImageData(0, 0, 64, 48);

            if (lastFrameData) {
                let diffCount = 0;
                const totalPixels = frame.data.length / 4;

                for (let i = 0; i < frame.data.length; i += 4) {
                    const rDiff = Math.abs(frame.data[i] - lastFrameData.data[i]);
                    const gDiff = Math.abs(frame.data[i + 1] - lastFrameData.data[i + 1]);
                    const bDiff = Math.abs(frame.data[i + 2] - lastFrameData.data[i + 2]);
                    if (rDiff + gDiff + bDiff > 75) {
                        diffCount++;
                    }
                }

                if (diffCount / totalPixels > 0.10) {
                    // Motion detected! Broadcast alert to all connected dashboards
                    activeDataConns.forEach((conn) => {
                        if (conn.open) {
                            conn.send({ type: 'motion_alert', timestamp: Date.now() });
                        }
                    });
                }
            }
            lastFrameData = frame;
        }, 500);
    }

    // OLED Stealth Mode
    function enterStealthMode() {
        stealthScreen.classList.remove('hidden');
        stealthScreen.classList.add('active');
        updateStealthClock();
    }

    function exitStealthMode() {
        stealthScreen.classList.add('hidden');
        stealthScreen.classList.remove('active');
    }

    function updateStealthClock() {
        const now = new Date();
        stealthClock.innerText = now.toTimeString().slice(0, 5);
    }
    setInterval(updateStealthClock, 10000);

    let lastTapTime = 0;
    stealthScreen.addEventListener('click', () => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTapTime;
        if (tapLength < 400 && tapLength > 0) {
            showPinScreen();
        }
        lastTapTime = currentTime;
    });

    document.getElementById('btnCCTVStealth').addEventListener('click', enterStealthMode);
    document.getElementById('btnCCTVTorch').addEventListener('click', () => toggleTorch());
    document.getElementById('btnCCTVFlip').addEventListener('click', flipCCTVCamera);
    document.getElementById('btnToggleQR').addEventListener('click', () => cctvQROverlay.classList.toggle('hidden'));
    document.getElementById('btnCloseQR').addEventListener('click', () => cctvQROverlay.classList.add('hidden'));

    document.getElementById('btnCCTVStop').addEventListener('click', () => {
        showPinScreen();
        const origVerify = verifyPin;
        verifyPin = function () {
            origVerify();
            if (!pinScreen.classList.contains('active')) {
                if (cctvStream) cctvStream.getTracks().forEach(t => t.stop());
                if (motionInterval) clearInterval(motionInterval);
                if (peer) {
                    try { peer.destroy(); } catch (e) {}
                }
                releaseWakeLock();
                showScreen(roleScreen);
                verifyPin = origVerify;
            }
        };
    });

    // ==========================================
    // 4. DASHBOARD VIEW (Monitor Hub)
    // ==========================================
    function startDashboardMode() {
        renderPairedCameras();
        showScreen(dashboardScreen);
    }

    function renderPairedCameras() {
        camerasList.innerHTML = '';
        if (pairedCameras.length === 0) {
            noCamerasCard.style.display = 'flex';
        } else {
            noCamerasCard.style.display = 'none';
            pairedCameras.forEach((cam, index) => {
                const tile = document.createElement('div');
                tile.className = 'camera-tile';
                tile.innerHTML = `
                    <div class="tile-info">
                        <h4>${cam.name || 'CCTV Camera'}</h4>
                        <div class="tile-meta">
                            <span class="status-orb pulse-emerald"></span>
                            <span>${cam.code}</span>
                        </div>
                    </div>
                    <div class="tile-actions">
                        <button class="tile-connect-btn" onclick="window.connectLiveCamera(${index})">View Live →</button>
                        <button class="tile-del-btn" onclick="window.deletePairedCamera(${index})" title="Delete Camera">🗑</button>
                    </div>
                `;
                camerasList.appendChild(tile);
            });
        }
    }

    window.deletePairedCamera = function (index) {
        if (confirm('Delete this paired camera from your dashboard?')) {
            pairedCameras.splice(index, 1);
            localStorage.setItem('cctv_paired_cameras', JSON.stringify(pairedCameras));
            renderPairedCameras();
        }
    };

    // Pairing Modal
    document.getElementById('btnOpenPairModal').addEventListener('click', openPairModal);
    document.getElementById('btnEmptyPairPrompt').addEventListener('click', openPairModal);
    document.getElementById('btnClosePairModal').addEventListener('click', closePairModal);

    function openPairModal() {
        pairModal.classList.remove('hidden');
        switchPairTab('scan');
    }

    function closePairModal() {
        pairModal.classList.add('hidden');
        stopScanner();
    }

    const tabScanQR = document.getElementById('tabScanQR');
    const tabManual = document.getElementById('tabManual');
    const scannerSection = document.getElementById('scannerSection');
    const manualSection = document.getElementById('manualSection');

    tabScanQR.addEventListener('click', () => switchPairTab('scan'));
    tabManual.addEventListener('click', () => switchPairTab('manual'));

    function switchPairTab(tab) {
        if (tab === 'scan') {
            tabScanQR.classList.add('active');
            tabManual.classList.remove('active');
            scannerSection.classList.add('active');
            manualSection.classList.remove('active');
            startScanner();
        } else {
            tabManual.classList.add('active');
            tabScanQR.classList.remove('active');
            manualSection.classList.add('active');
            scannerSection.classList.remove('active');
            stopScanner();
        }
    }

    // QR Code Scanner (Camera)
    async function startScanner() {
        try {
            scannerStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            scannerVideo.srcObject = scannerStream;

            const scanCanvas = document.createElement('canvas');
            const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });

            scannerScanInterval = setInterval(() => {
                if (scannerVideo.readyState === scannerVideo.HAVE_ENOUGH_DATA && window.jsQR) {
                    scanCanvas.width = scannerVideo.videoWidth;
                    scanCanvas.height = scannerVideo.videoHeight;
                    scanCtx.drawImage(scannerVideo, 0, 0, scanCanvas.width, scanCanvas.height);
                    const imageData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height);

                    if (code && code.data) {
                        try {
                            const parsed = JSON.parse(code.data);
                            if (parsed.type === 'cctv_pair' && parsed.code && parsed.secret) {
                                completePairing(parsed.code, parsed.secret, parsed.name);
                            }
                        } catch (e) {}
                    }
                }
            }, 300);
        } catch (err) {
            console.warn('QR scanner camera error:', err);
        }
    }

    function stopScanner() {
        if (scannerScanInterval) clearInterval(scannerScanInterval);
        if (scannerStream) {
            scannerStream.getTracks().forEach(t => t.stop());
            scannerStream = null;
        }
    }

    document.getElementById('btnSubmitManualPair').addEventListener('click', () => {
        const code = document.getElementById('inputCamCode').value.trim();
        const secret = document.getElementById('inputCamSecret').value.trim();
        const customName = document.getElementById('inputCamCustomName').value.trim();

        if (!code || !secret) {
            alert('Please enter Camera Code & Secret Key');
            return;
        }
        completePairing(code, secret, customName || 'Camera ' + code);
    });

    function completePairing(cameraCode, secret, name) {
        stopScanner();

        const exists = pairedCameras.find(c => c.code.toUpperCase() === cameraCode.toUpperCase());
        if (!exists) {
            pairedCameras.push({
                code: cameraCode.toUpperCase(),
                secret,
                name: name || 'CCTV ' + cameraCode,
                pairedAt: Date.now()
            });
            localStorage.setItem('cctv_paired_cameras', JSON.stringify(pairedCameras));
        }

        closePairModal();
        renderPairedCameras();
        showToast('✓ Camera linked successfully!');
    }

    // ==========================================
    // 5. LIVE MONITOR VIEWER (WebRTC Receiver)
    // ==========================================
    window.connectLiveCamera = function (index) {
        activeCamera = pairedCameras[index];
        if (!activeCamera) return;

        monitorCamName.innerText = activeCamera.name;
        showScreen(monitorScreen);

        // Show connecting overlay
        monitorLoader.classList.remove('hidden');
        connectingText.innerText = 'Locating Camera via Cloud P2P...';

        if (peer) {
            try { peer.destroy(); } catch (e) {}
        }

        // Initialize unique dashboard peer
        peer = new Peer(peerOptions);

        peer.on('open', (dashPeerId) => {
            const targetPeerId = getCCTVPeerId(activeCamera.code, activeCamera.secret);
            console.log('[Dashboard] Connecting to CCTV node:', targetPeerId);
            connectingText.innerText = 'Connecting to camera node...';

            // 1. Establish reliable data channel
            currentConn = peer.connect(targetPeerId, { reliable: true });

            currentConn.on('open', () => {
                console.log('[Dashboard] Data channel open! Requesting video stream...');
                connectingText.innerText = 'Requesting video stream from camera...';
                currentConn.send({ type: 'request_stream', dashboardPeerId: dashPeerId });
            });

            currentConn.on('data', (data) => {
                if (data.type === 'motion_alert') {
                    showMotionAlert();
                }
            });

            currentConn.on('close', () => {
                console.log('[Dashboard] Connection closed by camera');
            });

            currentConn.on('error', (err) => {
                console.error('[Dashboard] Data conn error:', err);
            });

            // 2. Incoming call listener (CCTV calls us with video stream!)
            peer.on('call', (call) => {
                console.log('[Dashboard] Incoming media call from CCTV camera!');
                connectingText.innerText = 'Receiving video frames...';
                currentCall = call;

                call.answer(); // Answer without sending local stream

                call.on('stream', (remoteStream) => {
                    console.log('[Dashboard] Received live remote stream! Attaching...');
                    attachRemoteStream(remoteStream);
                });

                call.on('close', () => {
                    showToast('Camera feed disconnected');
                    exitMonitorMode();
                });

                call.on('error', (err) => {
                    console.error('[Dashboard] Call error:', err);
                });
            });

            // 3. Dual-call Fallback: If camera doesn't call back within 4s, dashboard initiates call
            setTimeout(() => {
                if (!remoteVideo.srcObject && peer && !peer.destroyed) {
                    console.log('[Dashboard] Trying fallback direct call...');
                    connectingText.innerText = 'Initiating fallback connection...';

                    // Create dummy audio track for WebRTC offer compliance
                    try {
                        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                        const osc = audioCtx.createOscillator();
                        const dest = audioCtx.createMediaStreamDestination();
                        osc.connect(dest);
                        osc.start();
                        const dummyStream = dest.stream;

                        const fallbackCall = peer.call(targetPeerId, dummyStream);
                        if (fallbackCall) {
                            currentCall = fallbackCall;
                            fallbackCall.on('stream', (stream) => {
                                attachRemoteStream(stream);
                            });
                        }
                    } catch (e) {
                        console.log('Fallback call note:', e);
                    }
                }
            }, 3500);
        });

        peer.on('error', (err) => {
            console.error('[Dashboard] Peer error:', err);
            alert('Camera is currently offline or unreachable. Make sure the CCTV phone is in Camera Mode!');
            exitMonitorMode();
        });
    };

    function attachRemoteStream(stream) {
        remoteVideo.srcObject = stream;
        remoteVideo.muted = isMuted; // Start muted to satisfy mobile autoplay policies

        // Mobile autoplay play attempt
        const playPromise = remoteVideo.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                monitorLoader.classList.add('hidden');
                showToast('✓ Live Feed Connected (Sub-Second Latency)');
            }).catch((err) => {
                console.warn('Autoplay with audio blocked. Playing muted...', err);
                remoteVideo.muted = true;
                isMuted = true;
                updateAudioButton();
                remoteVideo.play();
                monitorLoader.classList.add('hidden');
            });
        } else {
            monitorLoader.classList.add('hidden');
        }

        remoteVideo.onloadedmetadata = () => {
            monitorLoader.classList.add('hidden');
        };
    }

    function sendRemoteCommand(cmd, val) {
        if (currentConn && currentConn.open) {
            currentConn.send({ command: cmd, value: val });
        } else {
            showToast('Reconnecting control channel...');
        }
    }

    // Remote Controls
    document.getElementById('btnRemoteTorch').addEventListener('click', () => {
        sendRemoteCommand('torch');
        showToast('🔦 Flashlight toggled');
    });

    document.getElementById('btnRemoteFlip').addEventListener('click', () => {
        sendRemoteCommand('flip');
        showToast('🔄 Lens flipped');
    });

    document.getElementById('btnRemoteAudio').addEventListener('click', () => {
        isMuted = !isMuted;
        remoteVideo.muted = isMuted;
        updateAudioButton();
        showToast(isMuted ? 'Audio Muted' : '🔊 Listening to Room Audio');
    });

    function updateAudioButton() {
        if (isMuted) {
            audioIcon.innerText = '🔇';
            audioLabel.innerText = 'Unmute';
        } else {
            audioIcon.innerText = '🔊';
            audioLabel.innerText = 'Mute';
        }
    }

    document.getElementById('btnRemoteSiren').addEventListener('click', () => {
        sendRemoteCommand('siren');
        showToast('🚨 Siren Alarm Triggered on CCTV!');
    });

    document.getElementById('btnRemoteSnapshot').addEventListener('click', () => {
        takeSnapshot();
    });

    document.getElementById('btnRemoteFullscreen').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            monitorScreen.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen();
        }
    });

    function takeSnapshot() {
        if (!remoteVideo || remoteVideo.videoWidth === 0) return;
        const snapCanvas = document.createElement('canvas');
        snapCanvas.width = remoteVideo.videoWidth;
        snapCanvas.height = remoteVideo.videoHeight;
        const ctx = snapCanvas.getContext('2d');
        ctx.drawImage(remoteVideo, 0, 0);

        const link = document.createElement('a');
        link.download = `cctv_capture_${Date.now()}.jpg`;
        link.href = snapCanvas.toDataURL('image/jpeg', 0.92);
        link.click();
        showToast('📸 HD Snapshot Saved to Phone');
    }

    function showMotionAlert() {
        motionBanner.classList.remove('hidden');
        playChimeAlert();
        setTimeout(() => motionBanner.classList.add('hidden'), 4500);
    }

    function playChimeAlert() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
            gain.gain.setValueAtTime(0.6, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
        } catch (e) {}
    }

    function playSirenAlert() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(1400, ctx.currentTime + 0.35);
            osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.7);
            gain.gain.setValueAtTime(0.9, ctx.currentTime);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 1.2);
        } catch (e) {}
    }

    function exitMonitorMode() {
        if (currentCall) {
            try { currentCall.close(); } catch (e) {}
            currentCall = null;
        }
        if (currentConn) {
            try { currentConn.close(); } catch (e) {}
            currentConn = null;
        }
        if (remoteVideo) remoteVideo.srcObject = null;
        if (peer) {
            try { peer.destroy(); } catch (e) {}
            peer = null;
        }
        activeCamera = null;
        showScreen(dashboardScreen);
    }

    // ==========================================
    // 6. ANDROID WAKELOCK (Continuous 24/7)
    // ==========================================
    async function requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (err) {}
    }

    function releaseWakeLock() {
        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
        }
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then((reg) => {
            reg.update();
            reg.onupdatefound = () => {
                const installingWorker = reg.installing;
                installingWorker.onstatechange = () => {
                    if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('App updated to latest version! Reloading...');
                        window.location.reload();
                    }
                };
            };
        }).catch(() => {});
    }

    checkPinSetup();
})();
