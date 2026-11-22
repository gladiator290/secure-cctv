# 100% Serverless Personal CCTV & Dashboard (Zero Laptop Needed)

Aapko apna **laptop 24/7 on rakhne ki koi zarurat nahi hai!** 
Humne is app ko **100% Serverless Cloud P2P (WebRTC + PeerJS Cloud)** me convert kar diya hai.

---

## ⚡ Ab Ye Kaise Kaam Karta Hai? (No Laptop / Zero Server)

```
[ CCTV Phone (Home Wi-Fi) ] <====== Direct P2P Video/Audio ======> [ Dashboard Phone (4G/5G Anywhere) ]
                                    \                          /
                                     \                        /
                                  [ Free 24/7 Public Cloud Broker ]
                                  (PeerJS / Google STUN Servers)
```

- **Video & Audio:** Dono phones ke beech direct Peer-to-Peer stream hoti hai (Encrypted).
- **Handshake Broker:** Free Google STUN & PeerJS Cloud 24/7 internet par available rehta hai.
- **Laptop:** Ek baar setup hone ke baad laptop poori tarah band kar sakte hain!

---

## 🚀 Laptop Band Karke 24/7 Chalane Ka Tarika (1-Minute Free Setup)

Yeh pura app sirf **Static Frontend (HTML, CSS, JS)** ban chuka hai jo [public/](file:///c:/Users/ombha/OneDrive/Desktop/WorkSpace/secure/public) folder me hai.

### Option A: Free Netlify Drop (Sabse Aasan - 30 Seconds)
1. Browser me kholiye: **[https://app.netlify.com/drop](https://app.netlify.com/drop)**
2. Apne computer se **`public`** folder ko drag karke wahan chhod dijiye.
3. Netlify aapko turant ek permanent **Free HTTPS Link** de dega (jaise `https://my-secure-cctv.netlify.app`).
4. **Done!** Ab laptop band kar dijiye.

### Option B: Free GitHub Pages
1. GitHub par ek naya free repository banayein.
2. Is folder ki files push karein aur **Settings ➔ Pages** me jakar Enable kar dein.
3. Aapko free permanent link mil jayega: `https://your-username.github.io/secure/public/`

---

## 📱 Phones Par Kaise Use Karein?

1. **CCTV Phone:**
   - Permanent HTTPS link ko Chrome me open karein.
   - 3-dots menu ➔ **"Add to Home Screen" / "Install App"** par tap karein.
   - Master PIN banayein ➔ **"CCTV Camera Mode"** chalu karein.
   - Screen par **Pairing QR Code** aa jayega.
   - Phone ko charger par laga kar screen par **"🌙 Stealth Mode"** daba dein (Screen pure black ho jayegi, battery nahi piyegi).

2. **Dashboard Phone(s):**
   - Apne regular phone me wahi link open karein aur "Install App" karein.
   - Master PIN enter karein ➔ **"Dashboard Viewer Mode"** me jayein.
   - **"+ Pair Camera"** daba kar CCTV phone ka QR scan karein.
   - **Ho gaya!** Ab aap office me ho ya 4G/5G par, bina laptop ke ghar ka live CCTV dekh sakte hain.
