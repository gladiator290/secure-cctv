// 100% Serverless Peer-to-Peer CCTV & Dashboard System
// Powered by WebRTC & PeerJS Cloud (Zero Home Server / Laptop Needed)

(function () {
    'use strict';

    // DOM Elements
    const pinScreen = document.getElementById('pinScreen');
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

    // Dashboard Elements
    const camerasList = document.getElementById('camerasList');
    const noCamerasCard = document.getElementById('noCamerasCard');
    const pairModal = document.getElementById('pairModal');
    const scannerVideo = document.getElementById('scannerVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const monitorCamName = document.getElementById('monitorCamName');
    const motionBanner = document.getElementById('motionBanner');

    // State Variables
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
    let activeCalls = new Map();
    let activeConnections = new Map();
    let motionInterval = null;
    let lastFrameData = null;

    // Dashboard State
    let pairedCameras = JSON.parse(localStorage.getItem('cctv_paired_cameras') || '[]');
    let activeCamera = null;
    let currentCall = null;
    let currentConn = null;
    let scannerStream = null;
    let scannerScanInterval = null;
    let isMuted = false;

    // WebRTC Free STUN Configuration
    const peerOptions = {
        debug: 1,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        }
    };

    // Helper: Build safe peer ID
    function getCCTVPeerId(code, secret) {
        return `cctv-${code.toLowerCase().replace(/[^a-z0-9]/g, '')}-${secret.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    }

    // ==========================================
    // 1. PIN SECURITY & AUTHENTICATION
    // ==========================================
    function checkPinSetup() {
        const storedPin = localStorage.getItem('cctv_master_pin');
        if (!storedPin) {
            settingUpPin = true;
            pinSubtext.innerText = 'Create 4-Digit Security Master PIN';
        } else {
            settingUpPin = false;
            pinSubtext.innerText = 'Enter Master PIN to continue';
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
            showToast('Master PIN set successfully!');
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

    document.querySelectorAll('.num-btn[data-val]').forEach(btn => {
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
    // 2. NAVIGATION & SCREEN MANAGEMENT
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
    // 3. CCTV CAMERA MODE (Broadcaster)
    // ==========================================
    async function startCCTVMode() {
        cctvCameraCode = localStorage.getItem('cctv_camera_code');
        cctvSecret = localStorage.getItem('cctv_camera_secret');

        if (!cctvCameraCode || !cctvSecret) {
            cctvCameraCode = 'CAM-' + Math.floor(1000 + Math.random() * 9000);
            cctvSecret = Math.random().toString(36).substring(2, 10);
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
        } catch (err) {
            alert('Camera Permission Error: ' + err.message + '\nPlease allow camera access.');
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
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 25 }
            },
            audio: true
        };

        cctvStream = await navigator.mediaDevices.getUserMedia(constraints);
        cctvVideo.srcObject = cctvStream;
    }

    function initCCTVPeer() {
        if (peer) peer.destroy();

        const peerId = getCCTVPeerId(cctvCameraCode, cctvSecret);
        peer = new Peer(peerId, peerOptions);

        peer.on('open', (id) => {
            console.log('[PeerJS Cloud Connected] CCTV ID:', id);
            showToast('CCTV Online & Broadcasting on Cloud P2P');
        });

        // Incoming Video Calls from Dashboards
        peer.on('call', (call) => {
            console.log('Incoming call from dashboard:', call.peer);
            call.answer(cctvStream);

            activeCalls.set(call.peer, call);
            viewerCount.innerText = activeCalls.size;

            call.on('close', () => {
                activeCalls.delete(call.peer);
                viewerCount.innerText = activeCalls.size;
            });
            call.on('error', () => {
                activeCalls.delete(call.peer);
                viewerCount.innerText = activeCalls.size;
            });
        });

        // Incoming Data Connections (Remote Commands: Torch, Flip, Siren)
        peer.on('connection', (conn) => {
            console.log('Control connection from dashboard:', conn.peer);
            activeConnections.set(conn.peer, conn);

            conn.on('data', (data) => {
                if (data.command === 'torch') toggleTorch(data.value);
                if (data.command === 'flip') flipCCTVCamera();
                if (data.command === 'siren') playSirenAlert();
                if (data.command === 'stealth') enterStealthMode();
            });

            conn.on('close', () => activeConnections.delete(conn.peer));
            conn.on('error', () => activeConnections.delete(conn.peer));
        });

        peer.on('error', (err) => {
            console.warn('PeerJS Error:', err.type, err.message);
            if (err.type === 'unavailable-id') {
                // If ID is busy, regenerate secret
                cctvSecret = Math.random().toString(36).substring(2, 10);
                localStorage.setItem('cctv_camera_secret', cctvSecret);
                initCCTVPeer();
            }
        });
    }

    // Client-Side QR Code Generator (100% Offline / Serverless)
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

    // Torch / Flashlight toggle
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
            showToast(cctvTorchOn ? 'Flashlight ON' : 'Flashlight OFF');
        } else {
            showToast('Flashlight not supported on this lens');
        }
    }

    // Flip Front/Back Camera
    async function flipCCTVCamera() {
        cctvFacingMode = cctvFacingMode === 'environment' ? 'user' : 'environment';
        await initCCTVCamera();

        // Update senders for active dashboard calls
        activeCalls.forEach((call) => {
            if (call.peerConnection) {
                const senders = call.peerConnection.getSenders();
                cctvStream.getTracks().forEach(track => {
                    const sender = senders.find(s => s.track && s.track.kind === track.kind);
                    if (sender) sender.replaceTrack(track);
                });
            }
        });
        showToast('Camera flipped');
    }

    // Motion Detection Algorithm (Canvas Differencing)
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
                    if (rDiff + gDiff + bDiff > 80) {
                        diffCount++;
                    }
                }

                // If > 12% pixels changed, send motion alert to all connected dashboards
                if (diffCount / totalPixels > 0.12) {
                    activeConnections.forEach((conn) => {
                        if (conn.open) {
                            conn.send({ type: 'motion', timestamp: Date.now() });
                        }
                    });
                }
            }
            lastFrameData = frame;
        }, 600);
    }

    // Stealth Mode (Black Screen)
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

    // CCTV Controls Event Listeners
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
                if (peer) peer.destroy();
                releaseWakeLock();
                showScreen(roleScreen);
                verifyPin = origVerify;
            }
        };
    });

    // ==========================================
    // 4. DASHBOARD MODE (Monitor)
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
                const card = document.createElement('div');
                card.className = 'cam-item-card';
                card.innerHTML = `
                    <div class="cam-info">
                        <h4>${cam.name || 'CCTV Camera'}</h4>
                        <div class="cam-code-tag">
                            <span class="badge-dot pulse"></span>
                            <span>${cam.code}</span>
                        </div>
                    </div>
                    <div class="cam-actions">
                        <button class="btn btn-sm btn-primary" onclick="window.connectLiveCamera(${index})">View Live</button>
                        <button class="icon-btn" onclick="window.deletePairedCamera(${index})" title="Delete">🗑</button>
                    </div>
                `;
                camerasList.appendChild(card);
            });
        }
    }

    window.deletePairedCamera = function (index) {
        if (confirm('Delete this paired camera?')) {
            pairedCameras.splice(index, 1);
            localStorage.setItem('cctv_paired_cameras', JSON.stringify(pairedCameras));
            renderPairedCameras();
        }
    };

    // Pair Modal
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
        showToast('Camera paired successfully!');
    }

    // ==========================================
    // 5. LIVE MONITOR VIEWER (Receiver)
    // ==========================================
    window.connectLiveCamera = function (index) {
        activeCamera = pairedCameras[index];
        if (!activeCamera) return;

        monitorCamName.innerText = activeCamera.name;
        showScreen(monitorScreen);

        if (peer) peer.destroy();
        peer = new Peer(peerOptions);

        peer.on('open', () => {
            const targetPeerId = getCCTVPeerId(activeCamera.code, activeCamera.secret);
            console.log('Calling CCTV camera:', targetPeerId);

            // Connect video/audio call
            currentCall = peer.call(targetPeerId, null);

            currentCall.on('stream', (remoteStream) => {
                console.log('Received remote CCTV stream!');
                remoteVideo.srcObject = remoteStream;
            });

            currentCall.on('close', () => {
                showToast('Camera stream closed');
                exitMonitorMode();
            });

            currentCall.on('error', (err) => {
                alert('Connection error: Camera is offline or unreachable.');
                exitMonitorMode();
            });

            // Connect control data channel
            currentConn = peer.connect(targetPeerId);
            currentConn.on('data', (data) => {
                if (data.type === 'motion') {
                    showMotionAlert();
                }
            });
        });

        peer.on('error', (err) => {
            console.error('Peer error:', err);
            alert('Camera is offline or not found.');
            exitMonitorMode();
        });
    };

    function sendRemoteCommand(cmd, val) {
        if (currentConn && currentConn.open) {
            currentConn.send({ command: cmd, value: val });
        } else {
            showToast('Control connection pending...');
        }
    }

    document.getElementById('btnRemoteTorch').addEventListener('click', () => {
        sendRemoteCommand('torch');
        showToast('Toggled Flashlight');
    });

    document.getElementById('btnRemoteFlip').addEventListener('click', () => {
        sendRemoteCommand('flip');
        showToast('Flipped Camera Lens');
    });

    document.getElementById('btnRemoteAudio').addEventListener('click', () => {
        isMuted = !isMuted;
        remoteVideo.muted = isMuted;
        document.getElementById('audioIcon').innerText = isMuted ? '🔇' : '🔊';
        showToast(isMuted ? 'Audio Muted' : 'Audio Unmuted');
    });

    document.getElementById('btnRemoteSiren').addEventListener('click', () => {
        sendRemoteCommand('siren');
        showToast('🚨 Triggered Alarm on CCTV!');
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
        link.download = `cctv_snapshot_${Date.now()}.jpg`;
        link.href = snapCanvas.toDataURL('image/jpeg', 0.9);
        link.click();
        showToast('📸 Snapshot saved!');
    }

    function showMotionAlert() {
        motionBanner.classList.remove('hidden');
        playChimeAlert();
        setTimeout(() => motionBanner.classList.add('hidden'), 4000);
    }

    function playChimeAlert() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.5, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) {}
    }

    function playSirenAlert() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.4);
            osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.8);
            gain.gain.setValueAtTime(0.8, ctx.currentTime);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 1.2);
        } catch (e) {}
    }

    function exitMonitorMode() {
        if (currentCall) {
            currentCall.close();
            currentCall = null;
        }
        if (currentConn) {
            currentConn.close();
            currentConn = null;
        }
        if (remoteVideo) remoteVideo.srcObject = null;
        if (peer) {
            peer.destroy();
            peer = null;
        }
        activeCamera = null;
        showScreen(dashboardScreen);
    }

    // ==========================================
    // 6. WAKE LOCK (Prevents Android Sleep)
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

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    checkPinSetup();
})();
