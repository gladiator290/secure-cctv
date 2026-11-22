const fs = require('fs');

async function build() {
    console.log('Sending build request with signing options to Cloud APK Builder...');
    const payload = {
        host: "gladiator290.github.io",
        name: "Secure CCTV",
        shortName: "SecureCCTV",
        launcherName: "Secure CCTV",
        packageId: "com.gladiator290.securecctv",
        pwaUrl: "https://gladiator290.github.io/secure-cctv/",
        startUrl: "/secure-cctv/",
        webManifestUrl: "https://gladiator290.github.io/secure-cctv/manifest.json",
        iconUrl: "https://gladiator290.github.io/secure-cctv/icon.png",
        appVersion: "2.3.0",
        appVersionCode: 3,
        backgroundColor: "#090d16",
        themeColor: "#0284c7",
        navigationColor: "#090d16",
        splashScreenFadeOutDuration: 300,
        fallbackType: "customtabs",
        signingMode: "new",
        signing: {
            fullName: "Om Bhalla",
            organization: "Personal",
            organizationalUnit: "Personal",
            countryCode: "IN",
            keyPassword: "password123",
            storePassword: "password123",
            alias: "android"
        },
        display: "standalone"
    };

    const res = await fetch('https://pwabuilder-cloudapk.azurewebsites.net/generateAppPackage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Cloud APK Build failed (${res.status}): ${errText}`);
    }

    const buffer = await res.arrayBuffer();
    fs.writeFileSync('cctv-app.zip', Buffer.from(buffer));
    console.log('Downloaded cctv-app.zip successfully! Size:', buffer.byteLength, 'bytes');
}

build().catch(console.error);
