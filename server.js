const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const os = require('os');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const QRCode = require('qrcode');
const selfsigned = require('selfsigned');

const app = express();
app.use(cors());
app.use(express.json());

// Determine Local Wi-Fi IPv4 address
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

const localIp = getLocalIpAddress();
const HTTP_PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/jsQR.js', express.static(path.join(__dirname, 'node_modules/jsqr/dist/jsQR.js')));

// API: Server Info (Local IP & Ports)
app.get('/api/info', (req, res) => {
    res.json({
        localIp,
        httpPort: HTTP_PORT,
        httpsPort: HTTPS_PORT,
        localHttpsUrl: `https://${localIp}:${HTTPS_PORT}`,
        localHttpUrl: `http://${localIp}:${HTTP_PORT}`
    });
});

// API: Generate QR Code data URL
app.get('/api/qr', async (req, res) => {
    const text = req.query.text;
    if (!text) {
        return res.status(400).json({ error: 'Text query parameter is required' });
    }
    try {
        const qrDataUrl = await QRCode.toDataURL(text, {
            width: 320,
            margin: 2,
            color: { dark: '#0284c7', light: '#ffffff' }
        });
        res.json({ qr: qrDataUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// State Management
// cameraCode => { socketId, secret, name, registeredAt, pairedDashboards: Set() }
const registeredCameras = new Map();

function setupSocketIO(ioInstance) {
    ioInstance.on('connection', (socket) => {
        // Register camera mode
        socket.on('camera:register', (data, callback) => {
            const { cameraCode, secret, name } = data || {};
            if (!cameraCode || !secret) {
                if (callback) callback({ success: false, error: 'cameraCode & secret required' });
                return;
            }

            const existing = registeredCameras.get(cameraCode);
            const pairedDashboards = existing ? existing.pairedDashboards : new Set();

            registeredCameras.set(cameraCode, {
                socketId: socket.id,
                secret,
                name: name || 'CCTV Camera',
                registeredAt: Date.now(),
                pairedDashboards
            });

            socket.join(`camera:${cameraCode}`);
            socket.cameraCode = cameraCode;
            socket.isCamera = true;

            console.log(`[CCTV Registered] Code: ${cameraCode} | Socket: ${socket.id}`);
            if (callback) callback({ success: true, cameraCode });

            // Notify anyone waiting in that camera's room
            socket.to(`camera:${cameraCode}`).emit('camera:status', { online: true, cameraCode });
        });

        // Pair Dashboard with Camera
        socket.on('dashboard:pair', (data, callback) => {
            const { cameraCode, secret, dashboardId, dashboardName } = data || {};
            const camera = registeredCameras.get(cameraCode);

            if (!camera) {
                if (callback) callback({ success: false, error: 'Camera is offline or not found' });
                return;
            }

            if (camera.secret !== secret) {
                if (callback) callback({ success: false, error: 'Invalid pairing secret key' });
                return;
            }

            camera.pairedDashboards.add(dashboardId || socket.id);
            console.log(`[Dashboard Paired] Dashboard: ${dashboardName || dashboardId} -> Camera: ${cameraCode}`);

            ioInstance.to(camera.socketId).emit('camera:dashboard_paired', {
                dashboardId,
                dashboardName: dashboardName || 'Remote Dashboard',
                timestamp: Date.now()
            });

            if (callback) {
                callback({
                    success: true,
                    cameraCode,
                    cameraName: camera.name
                });
            }
        });

        // Dashboard Connect for Live View
        socket.on('dashboard:connect', (data, callback) => {
            const { cameraCode, secret } = data || {};
            const camera = registeredCameras.get(cameraCode);

            if (!camera) {
                if (callback) callback({ success: false, error: 'Camera is currently offline' });
                return;
            }

            if (camera.secret !== secret) {
                if (callback) callback({ success: false, error: 'Invalid authentication secret' });
                return;
            }

            socket.join(`camera:${cameraCode}`);
            socket.activeCameraCode = cameraCode;
            socket.isDashboard = true;

            console.log(`[Dashboard Connected] Socket: ${socket.id} -> Camera: ${cameraCode}`);

            if (callback) callback({ success: true, cameraOnline: true });

            ioInstance.to(camera.socketId).emit('camera:request_stream', {
                dashboardSocketId: socket.id
            });
        });

        // WebRTC Signaling: Offer
        socket.on('webrtc:offer', (data) => {
            const { targetSocketId, sdp } = data;
            ioInstance.to(targetSocketId).emit('webrtc:offer', {
                fromSocketId: socket.id,
                sdp
            });
        });

        // WebRTC Signaling: Answer
        socket.on('webrtc:answer', (data) => {
            const { targetSocketId, sdp } = data;
            ioInstance.to(targetSocketId).emit('webrtc:answer', {
                fromSocketId: socket.id,
                sdp
            });
        });

        // WebRTC Signaling: ICE Candidate
        socket.on('webrtc:ice', (data) => {
            const { targetSocketId, candidate } = data;
            ioInstance.to(targetSocketId).emit('webrtc:ice', {
                fromSocketId: socket.id,
                candidate
            });
        });

        // Dashboard Remote Controls (Torch, Flip Camera, Siren, Stealth Mode)
        socket.on('camera:control', (data) => {
            const { cameraCode, command, value } = data;
            const camera = registeredCameras.get(cameraCode);
            if (camera && camera.socketId) {
                ioInstance.to(camera.socketId).emit('camera:execute_command', {
                    command,
                    value,
                    fromDashboard: socket.id
                });
            }
        });

        // Motion Detection Alert from CCTV
        socket.on('camera:motion', (data) => {
            const { cameraCode, snapshot, timestamp } = data;
            ioInstance.to(`camera:${cameraCode}`).emit('dashboard:motion_alert', {
                cameraCode,
                snapshot,
                timestamp: timestamp || Date.now()
            });
        });

        // Disconnect Handler
        socket.on('disconnect', () => {
            if (socket.isCamera && socket.cameraCode) {
                const camera = registeredCameras.get(socket.cameraCode);
                if (camera && camera.socketId === socket.id) {
                    console.log(`[CCTV Offline] Code: ${socket.cameraCode}`);
                    ioInstance.to(`camera:${socket.cameraCode}`).emit('camera:status', {
                        online: false,
                        cameraCode: socket.cameraCode
                    });
                    registeredCameras.delete(socket.cameraCode);
                }
            }
        });
    });
}

// Start HTTP & HTTPS Servers
async function startServer() {
    const certDir = path.join(__dirname, '.ssl');
    const keyPath = path.join(certDir, 'key.pem');
    const certPath = path.join(certDir, 'cert.pem');

    if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir, { recursive: true });
    }

    let sslOptions = null;
    try {
        if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
            console.log('Generating self-signed SSL certificate for local HTTPS...');
            const pems = await selfsigned.generate(
                [
                    { name: 'commonName', value: localIp },
                    { name: 'organizationName', value: 'Personal CCTV System' }
                ],
                {
                    days: 365,
                    keySize: 2048,
                    extensions: [
                        {
                            name: 'subjectAltName',
                            altNames: [
                                { type: 2, value: 'localhost' },
                                { type: 7, ip: localIp },
                                { type: 7, ip: '127.0.0.1' }
                            ]
                        }
                    ]
                }
            );
            fs.writeFileSync(keyPath, pems.private);
            fs.writeFileSync(certPath, pems.cert);
        }

        sslOptions = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        };
    } catch (err) {
        console.error('SSL Generation note:', err.message);
    }

    // HTTP Server
    const httpServer = http.createServer(app);
    const ioHttp = new Server(httpServer, { cors: { origin: '*' } });
    setupSocketIO(ioHttp);

    httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
        console.log(`\n======================================================`);
        console.log(`   SECURE PERSONAL CCTV & DASHBOARD SYSTEM ACTIVE     `);
        console.log(`======================================================`);
        console.log(`Local Wi-Fi HTTP  : http://${localIp}:${HTTP_PORT}`);
        console.log(`Localhost HTTP    : http://localhost:${HTTP_PORT}`);
        if (sslOptions) {
            console.log(`Local Wi-Fi HTTPS : https://${localIp}:${HTTPS_PORT} (Best for Mobile Camera)`);
            console.log(`Localhost HTTPS   : https://localhost:${HTTPS_PORT}`);
        }
        console.log(`======================================================`);
        console.log(`MOBILE SETUP (Android 8 to Latest):`);
        console.log(`1. Same Wi-Fi par mobile Chrome me kholiye:`);
        console.log(`   https://${localIp}:${HTTPS_PORT}`);
        console.log(`   (Chrome me "Advanced -> Proceed" par tap karein)`);
        console.log(`2. Chrome Menu (3 dots) -> "Add to Home Screen" ya "Install App"`);
        console.log(`   ye ek real mobile app ki tarah save ho jayega!`);
        console.log(`======================================================\n`);
    });

    // HTTPS Server
    if (sslOptions) {
        const httpsServer = https.createServer(sslOptions, app);
        const ioHttps = new Server(httpsServer, { cors: { origin: '*' } });
        setupSocketIO(ioHttps);

        httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
            // HTTPS listening
        });
    }
}

startServer();
