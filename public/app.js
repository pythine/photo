(() => {
  'use strict';

  // ====== KONFIGURASI ======
  // STUN gratis cukup untuk kebanyakan jaringan. Jika video tidak muncul di sebagian
  // jaringan (mis. kantor / kartu seluler tertentu), tambahkan server TURN di sini.
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // { urls: 'turn:HOST:3478', username: 'USER', credential: 'PASSWORD' },
  ];
  const W = 640, H = 480;

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ====== ELEMEN ======
  const lobby = $('lobby'), booth = $('booth'), stage = $('stage');
  const nameInput = $('nameInput'), roomInput = $('roomInput'), lobbyMsg = $('lobbyMsg');
  const srcVideo = $('srcVideo'), remoteVideo = $('remoteVideo');
  const localCanvas = $('localCanvas'), ctx = localCanvas.getContext('2d');
  const waiting = $('waiting'), countdownEl = $('countdown'), flashEl = $('flash');
  const btnShoot = $('btnShoot'), btnMic = $('btnMic'), btnCam = $('btnCam');
  const shotInfo = $('shotInfo'), bgGrid = $('bgGrid');
  const modal = $('modal'), resultCanvas = $('resultCanvas');

  // ====== STATE ======
  let ws = null, pc = null;
  let role = 'left', myName = 'Aku', peerName = null, room = '';
  let cam = null, outStream = null, seg = null;
  let currentBg = 'none', customDataUrl = null;
  let pendingCandidates = [];
  let shooting = false, loopRunning = false, joining = false;
  let lastShots = [];
  const bgCache = {};

  // ====== BACKGROUND PRESET (digambar dengan canvas, tanpa file gambar) ======
  function mk() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    return [c, c.getContext('2d')];
  }
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function heart(x, cx, cy, s) {
    x.beginPath();
    x.moveTo(cx, cy + s * 0.35);
    x.bezierCurveTo(cx - s, cy - s * 0.3, cx - s * 0.5, cy - s * 0.95, cx, cy - s * 0.4);
    x.bezierCurveTo(cx + s * 0.5, cy - s * 0.95, cx + s, cy - s * 0.3, cx, cy + s * 0.35);
    x.fill();
  }

  const PRESETS = {
    sunset() {
      const [c, x] = mk();
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2b1055'); g.addColorStop(0.5, '#ff6a88'); g.addColorStop(1, '#ffd194');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = 'rgba(255,240,200,.92)';
      x.beginPath(); x.arc(W / 2, H * 0.72, 90, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(40,20,70,.88)'; x.fillRect(0, H * 0.82, W, H * 0.18);
      return c;
    },
    pastel() {
      const [c, x] = mk();
      const g = x.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#ffd1dc'); g.addColorStop(0.5, '#e8d5ff'); g.addColorStop(1, '#c9e8ff');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const r = rng(7);
      for (let i = 0; i < 14; i++) {
        x.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.25})`;
        x.beginPath(); x.arc(r() * W, r() * H, 30 + r() * 70, 0, Math.PI * 2); x.fill();
      }
      return c;
    },
    night() {
      const [c, x] = mk();
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0f0c29'); g.addColorStop(0.55, '#302b63'); g.addColorStop(1, '#24243e');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const r = rng(21);
      for (let i = 0; i < 90; i++) {
        x.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`;
        x.beginPath(); x.arc(r() * W, r() * H, 0.6 + r() * 1.8, 0, Math.PI * 2); x.fill();
      }
      x.fillStyle = '#fff6d6';
      x.beginPath(); x.arc(W * 0.8, H * 0.2, 42, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#302b63';
      x.beginPath(); x.arc(W * 0.8 + 16, H * 0.2 - 8, 38, 0, Math.PI * 2); x.fill();
      return c;
    },
    hearts() {
      const [c, x] = mk();
      x.fillStyle = '#ffd6e7'; x.fillRect(0, 0, W, H);
      const cols = ['#ff8fb8', '#ff6b9d', '#ffb3d1', '#ffffff', '#e4457f'];
      const r = rng(3);
      for (let i = 0; i < 38; i++) {
        x.globalAlpha = 0.45 + r() * 0.5;
        x.fillStyle = cols[Math.floor(r() * cols.length)];
        heart(x, r() * W, r() * H, 14 + r() * 34);
      }
      x.globalAlpha = 1;
      return c;
    },
    dots() {
      const [c, x] = mk();
      x.fillStyle = '#fff7e6'; x.fillRect(0, 0, W, H);
      const cols = ['#ffb3c6', '#a0e7e5', '#ffe29a', '#c5b3ff'];
      let k = 0;
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 12; col++) {
          x.fillStyle = cols[k++ % cols.length];
          x.beginPath();
          x.arc(col * 60 + (row % 2 ? 30 : 0), row * 58 + 20, 17, 0, Math.PI * 2);
          x.fill();
        }
      }
      return c;
    },
    beach() {
      const [c, x] = mk();
      const sky = x.createLinearGradient(0, 0, 0, H * 0.6);
      sky.addColorStop(0, '#6ec6ff'); sky.addColorStop(1, '#d9f1ff');
      x.fillStyle = sky; x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff3a8';
      x.beginPath(); x.arc(W * 0.78, H * 0.18, 44, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#2aa7d8'; x.fillRect(0, H * 0.5, W, H * 0.2);
      x.fillStyle = 'rgba(255,255,255,.7)';
      for (let i = 0; i < 6; i++) x.fillRect(i * 120 + 20, H * 0.58, 70, 4);
      x.fillStyle = '#f6dfa4'; x.fillRect(0, H * 0.7, W, H * 0.3);
      return c;
    },
  };

  const BG_LIST = [
    { id: 'none', label: 'Asli', icon: '🎥' },
    { id: 'blur', label: 'Blur', icon: '🌫️' },
    { id: 'sunset', label: 'Sunset' },
    { id: 'pastel', label: 'Pastel' },
    { id: 'night', label: 'Malam' },
    { id: 'hearts', label: 'Hati' },
    { id: 'dots', label: 'Polkadot' },
    { id: 'beach', label: 'Pantai' },
  ];

  function getBgCanvas(id) {
    if (bgCache[id]) return bgCache[id];
    if (PRESETS[id]) bgCache[id] = PRESETS[id]();
    return bgCache[id] || null;
  }

  // ====== GAMBAR KAMERA + GANTI BACKGROUND ======
  function drawCover(c, src, dw, dh) {
    const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
    if (!sw || !sh) return;
    const s = Math.max(dw / sw, dh / sh);
    const w = sw * s, h = sh * s;
    c.drawImage(src, (dw - w) / 2, (dh - h) / 2, w, h);
  }
  function drawMirrored(c, src, scale = 1) {
    c.save();
    c.translate(W / 2, H / 2);
    c.scale(-scale, scale);
    c.translate(-W / 2, -H / 2);
    drawCover(c, src, W, H);
    c.restore();
  }

  const smallBlur = document.createElement('canvas');
  smallBlur.width = 32; smallBlur.height = 24;

  function drawBackground() {
    if (currentBg === 'blur') {
      ctx.save();
      ctx.fillStyle = '#777';
      ctx.fillRect(0, 0, W, H);
      if ('filter' in ctx) {
        ctx.filter = 'blur(16px)';
        drawMirrored(ctx, srcVideo, 1.08);
      } else {
        // cadangan untuk browser tanpa ctx.filter: kecilkan lalu besarkan
        const sc = smallBlur.getContext('2d');
        sc.save(); sc.translate(32, 0); sc.scale(-1, 1);
        drawCover(sc, srcVideo, 32, 24);
        sc.restore();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(smallBlur, 0, 0, W, H);
      }
      ctx.restore();
    } else {
      const bc = getBgCanvas(currentBg);
      if (bc) ctx.drawImage(bc, 0, 0, W, H);
    }
  }

  function drawPlain() {
    ctx.clearRect(0, 0, W, H);
    drawMirrored(ctx, srcVideo);
  }

  function onResults(res) {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    drawCover(ctx, res.segmentationMask, W, H);
    ctx.globalCompositeOperation = 'source-in';
    drawCover(ctx, res.image, W, H);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    drawBackground();
    ctx.restore();
  }

  let busy = false;
  async function loop() {
    if (!loopRunning) return;
    if (srcVideo.readyState >= 2 && !busy) {
      busy = true;
      try {
        if (currentBg === 'none' || !seg) drawPlain();
        else await seg.send({ image: srcVideo });
      } catch (e) {
        console.error(e);
        drawPlain();
      }
      busy = false;
    }
    requestAnimationFrame(loop);
  }

  // ====== KAMERA ======
  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('INSECURE');
    }
    const video = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' };
    try {
      cam = await navigator.mediaDevices.getUserMedia({
        video, audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      // coba tanpa mikrofon
      cam = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    }
    srcVideo.srcObject = cam;
    await srcVideo.play();

    if (typeof SelfieSegmentation === 'function') {
      seg = new SelfieSegmentation({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`,
      });
      seg.setOptions({ modelSelection: 1 });
      seg.onResults(onResults);
      try { seg.initialize(); } catch (e) { /* dimuat saat dipakai */ }
    }

    const cs = localCanvas.captureStream(30);
    outStream = new MediaStream([...cs.getVideoTracks(), ...cam.getAudioTracks()]);
    if (!cam.getAudioTracks().length) { btnMic.disabled = true; btnMic.textContent = '🎤 Tidak ada mic'; }

    loopRunning = true;
    loop();
    renderGrid();
  }

  function stopCamera() {
    loopRunning = false;
    if (cam) cam.getTracks().forEach((t) => t.stop());
    cam = null; outStream = null; seg = null;
  }

  // ====== PILIHAN BACKGROUND (UI) ======
  function renderGrid() {
    bgGrid.innerHTML = '';
    const items = BG_LIST.slice();
    if (bgCache.custom) items.push({ id: 'custom', label: 'Milikmu' });
    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'bg-item' + (it.id === currentBg ? ' active' : '');
      b.dataset.id = it.id;
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      const bc = getBgCanvas(it.id);
      if (bc) {
        const t = document.createElement('canvas');
        t.width = 96; t.height = 72;
        t.getContext('2d').drawImage(bc, 0, 0, 96, 72);
        thumb.appendChild(t);
      } else {
        thumb.textContent = it.icon || '';
      }
      const lab = document.createElement('span');
      lab.textContent = it.label;
      b.append(thumb, lab);
      if (!seg && it.id !== 'none') b.disabled = true;
      b.addEventListener('click', () => setBg(it.id, true));
      bgGrid.appendChild(b);
    });
    const old = document.querySelector('.note');
    if (old) old.remove();
    if (!seg) {
      const n = document.createElement('p');
      n.className = 'note';
      n.textContent = 'Model AI background gagal dimuat (butuh internet ke cdn.jsdelivr.net). Muat ulang halaman.';
      bgGrid.after(n);
    }
  }

  function setBg(id, broadcast) {
    currentBg = id;
    document.querySelectorAll('.bg-item').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    if (broadcast) sendBg();
  }
  function sendBg() {
    wsSend({ type: 'bg', id: currentBg, data: currentBg === 'custom' ? customDataUrl : undefined });
  }

  function setCustomFromImage(img) {
    const [c, x] = mk();
    drawCover(x, img, W, H);
    bgCache.custom = c;
    customDataUrl = c.toDataURL('image/jpeg', 0.7);
    renderGrid();
  }
  $('uploadBg').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      setCustomFromImage(img);
      URL.revokeObjectURL(img.src);
      setBg('custom', true);
    };
    img.src = URL.createObjectURL(f);
    e.target.value = '';
  });

  // ====== WEBRTC ======
  function createPC() {
    closePC();
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    outStream.getTracks().forEach((t) => pc.addTrack(t, outStream));
    pc.ontrack = (e) => {
      remoteVideo.srcObject = e.streams[0];
      waiting.classList.add('hidden');
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) wsSend({ type: 'candidate', candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') {
        setStatus(`Live bersama ${peerName || 'pasangan'} ❤️`);
        btnShoot.disabled = false;
      } else if (s === 'connecting') {
        setStatus('Menyambungkan video...');
      } else if (s === 'failed') {
        setStatus('Video gagal tersambung. Coba muat ulang, atau gunakan server TURN (lihat README).');
        btnShoot.disabled = true;
      } else if (s === 'disconnected') {
        setStatus('Koneksi video terputus...');
      }
    };
    return pc;
  }
  function closePC() {
    if (pc) { try { pc.close(); } catch (e) {} }
    pc = null;
    pendingCandidates = [];
  }
  async function flushCandidates() {
    const list = pendingCandidates; pendingCandidates = [];
    for (const c of list) { try { await pc.addIceCandidate(c); } catch (e) { console.warn(e); } }
  }

  // ====== WEBSOCKET / SIGNALING ======
  function wsSend(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }
  function setStatus(t) { $('statusText').textContent = t; }

  function connectWS(code) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    let chain = Promise.resolve();
    ws.onopen = () => wsSend({ type: 'join', room: code, name: myName });
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      chain = chain.then(() => handleMsg(msg)).catch(console.error);
    };
    ws.onclose = () => {
      if (!booth.classList.contains('hidden')) setStatus('Koneksi ke server terputus. Muat ulang halaman.');
    };
    ws.onerror = () => { lobbyMsg.textContent = 'Tidak bisa terhubung ke server.'; };
  }

  async function handleMsg(msg) {
    switch (msg.type) {
      case 'joined': {
        role = msg.role; room = msg.room;
        $('roomLabel').textContent = room;
        stage.classList.toggle('role-right', role === 'right');
        $('labelLocal').textContent = myName + ' (kamu)';
        lobby.classList.add('hidden');
        booth.classList.remove('hidden');
        history.replaceState(null, '', '?room=' + room);
        if (msg.peerName) {
          peerName = msg.peerName;
          $('labelRemote').textContent = peerName;
          setStatus(`Menyambungkan dengan ${peerName}...`);
        } else {
          setStatus('Menunggu pasangan masuk...');
        }
        joining = false;
        break;
      }
      case 'full':
        lobbyMsg.textContent = 'Room sudah penuh (maksimal 2 orang).';
        if (ws) ws.close();
        stopCamera();
        joining = false;
        break;

      case 'peer-joined': {
        // kita yang sudah ada duluan -> buat offer
        peerName = msg.peerName;
        $('labelRemote').textContent = peerName;
        setStatus(`${peerName} masuk. Menyambungkan video...`);
        createPC();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsSend({ type: 'offer', sdp: pc.localDescription });
        sendBg();
        break;
      }
      case 'offer': {
        createPC();
        await pc.setRemoteDescription(msg.sdp);
        await flushCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        wsSend({ type: 'answer', sdp: pc.localDescription });
        break;
      }
      case 'answer':
        if (pc) { await pc.setRemoteDescription(msg.sdp); await flushCandidates(); }
        break;
      case 'candidate':
        if (pc && pc.remoteDescription) {
          try { await pc.addIceCandidate(msg.candidate); } catch (e) { console.warn(e); }
        } else {
          pendingCandidates.push(msg.candidate);
        }
        break;

      case 'bg':
        if (msg.id === 'custom' && msg.data) {
          const img = new Image();
          await new Promise((res) => { img.onload = res; img.onerror = res; img.src = msg.data; });
          setCustomFromImage(img);
        }
        if (msg.id !== 'custom' || bgCache.custom) setBg(msg.id, false);
        break;

      case 'shoot':
        runSequence(msg.count);
        break;

      case 'peer-left':
        closePC();
        remoteVideo.srcObject = null;
        waiting.classList.remove('hidden');
        btnShoot.disabled = true;
        setStatus(`${peerName || 'Pasangan'} keluar. Menunggu masuk lagi...`);
        peerName = null;
        $('labelRemote').textContent = 'Pasangan';
        break;
    }
  }

  // ====== LOBBY ======
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function randomCode() {
    let s = '';
    for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  async function join(code) {
    if (joining) return;
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) { lobbyMsg.textContent = 'Isi kode room dulu.'; return; }
    joining = true;
    myName = nameInput.value.trim() || 'Aku';
    try { localStorage.setItem('pb-name', myName); } catch (e) {}
    lobbyMsg.textContent = 'Menyalakan kamera...';
    try {
      if (!cam) await startCamera();
    } catch (e) {
      joining = false;
      lobbyMsg.textContent = e.message === 'INSECURE'
        ? 'Kamera hanya bisa dipakai lewat HTTPS atau localhost. Lihat README.'
        : 'Kamera tidak bisa diakses. Pastikan izin kamera diberikan.';
      return;
    }
    lobbyMsg.textContent = 'Masuk ke room...';
    connectWS(code);
  }

  $('btnCreate').addEventListener('click', () => join(randomCode()));
  $('btnJoin').addEventListener('click', () => join(roomInput.value));
  roomInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(roomInput.value); });

  $('btnCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setStatus('Link room disalin. Kirim ke pasanganmu!');
    } catch (e) {
      window.prompt('Salin link ini:', location.href);
    }
  });
  $('btnLeave').addEventListener('click', () => {
    if (ws) ws.close();
    stopCamera();
    location.href = location.pathname;
  });

  btnMic.addEventListener('click', () => {
    const t = cam && cam.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    btnMic.textContent = '🎤 Mic: ' + (t.enabled ? 'On' : 'Off');
  });
  btnCam.addEventListener('click', () => {
    const t = cam && cam.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    btnCam.textContent = '📹 Kamera: ' + (t.enabled ? 'On' : 'Off');
  });

  // ====== AMBIL FOTO ======
  function snap(src) {
    const [c, x] = mk();
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    drawCover(x, src, W, H);
    return c;
  }

  async function runSequence(count) {
    if (shooting) return;
    shooting = true;
    closeModal();
    btnShoot.disabled = true;
    const shots = [];
    for (let i = 0; i < count; i++) {
      shotInfo.textContent = `Foto ${i + 1} dari ${count} — bersiap!`;
      for (let n = 3; n >= 1; n--) {
        countdownEl.classList.remove('show');
        void countdownEl.offsetWidth; // restart animasi
        countdownEl.textContent = n;
        countdownEl.classList.add('show');
        await sleep(1000);
      }
      countdownEl.classList.remove('show');
      flashEl.classList.add('on');
      setTimeout(() => flashEl.classList.remove('on'), 120);
      shots.push({ local: snap(localCanvas), remote: snap(remoteVideo) });
      await sleep(800);
    }
    shotInfo.textContent = '';
    shooting = false;
    btnShoot.disabled = !pc || pc.connectionState !== 'connected';
    lastShots = shots;
    openResult();
  }

  btnShoot.addEventListener('click', () => {
    if (shooting) return;
    const count = parseInt($('shotCount').value, 10) || 3;
    wsSend({ type: 'shoot', count });
    runSequence(count);
  });

  // ====== HASIL FOTO ======
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function isLight(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
  }

  function renderResult() {
    const n = lastShots.length;
    if (!n) return;
    const pad = 36, gap = 18, gutter = 12, cw = 420, ch = 315, footer = 110;
    const cvW = pad * 2 + cw * 2 + gutter;
    const cvH = pad + n * ch + (n - 1) * gap + footer;
    resultCanvas.width = cvW;
    resultCanvas.height = cvH;
    const c = resultCanvas.getContext('2d');
    const frame = $('frameColor').value;
    c.fillStyle = frame;
    c.fillRect(0, 0, cvW, cvH);

    lastShots.forEach((s, i) => {
      const y = pad + i * (ch + gap);
      const leftImg = role === 'left' ? s.local : s.remote;
      const rightImg = role === 'left' ? s.remote : s.local;
      [[leftImg, pad], [rightImg, pad + cw + gutter]].forEach(([img, x]) => {
        c.save();
        rr(c, x, y, cw, ch, 14);
        c.clip();
        c.drawImage(img, x, y, cw, ch);
        c.restore();
      });
    });

    const dark = isLight(frame);
    c.fillStyle = dark ? '#3b2a33' : '#ffffff';
    c.textAlign = 'center';
    c.font = 'bold 36px Georgia, serif';
    c.fillText($('captionInput').value || '', cvW / 2, cvH - footer + 44);
    c.font = '20px system-ui, sans-serif';
    c.globalAlpha = 0.8;
    const leftName = role === 'left' ? myName : (peerName || 'Pasangan');
    const rightName = role === 'left' ? (peerName || 'Pasangan') : myName;
    const date = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    c.fillText(`${leftName} ❤ ${rightName}  •  ${date}`, cvW / 2, cvH - footer + 80);
    c.globalAlpha = 1;
  }

  function openResult() {
    modal.classList.remove('hidden');
    renderResult();
  }
  function closeModal() { modal.classList.add('hidden'); }

  $('frameColor').addEventListener('input', renderResult);
  $('captionInput').addEventListener('input', renderResult);
  $('btnClose').addEventListener('click', closeModal);
  $('btnRetake').addEventListener('click', () => {
    closeModal();
    btnShoot.click();
  });
  $('btnDownload').addEventListener('click', () => {
    resultCanvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const d = new Date();
      const p = (v) => String(v).padStart(2, '0');
      a.download = `photobooth-ldr-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  });

  // ====== INIT ======
  btnShoot.disabled = true;
  try { nameInput.value = localStorage.getItem('pb-name') || ''; } catch (e) {}
  const qRoom = new URLSearchParams(location.search).get('room');
  if (qRoom) {
    roomInput.value = qRoom.toUpperCase();
    lobbyMsg.textContent = 'Kamu diundang ke room ' + roomInput.value + '. Isi nama lalu tekan Gabung.';
  }
})();
