# 📸 Photobooth LDR

Photobooth online untuk pasangan jarak jauh. Kalian berdua video call live, pilih background bersama, lalu ambil foto strip dengan hitung mundur yang sama. Hasilnya bisa diberi warna frame + caption, lalu di-download sebagai PNG.

## Fitur

- Video + suara live antar dua orang (WebRTC, langsung peer-to-peer)
- Room dengan kode / link undangan (maksimal 2 orang)
- Pilihan background: asli, blur, 6 preset (sunset, pastel, malam, hati, polkadot, pantai), atau upload gambar sendiri
- Background berlaku untuk kalian berdua (diganti dengan AI segmentasi di browser masing-masing)
- Foto 1 / 3 / 4 pose dengan countdown 3-2-1 dan efek flash, tersinkron di dua sisi
- Hasil strip foto: ubah warna frame & caption, download PNG
- Tombol mic dan kamera on/off

## Struktur

```
photobooth-ldr/
├── package.json
├── server.js          # server web + signaling WebSocket
└── public/
    ├── index.html
    ├── style.css
    └── app.js         # WebRTC, background, countdown, strip foto
```

## Cara menjalankan (di komputer sendiri)

1. Pasang **Node.js** versi 16 atau lebih baru dari https://nodejs.org
2. Buka terminal di folder `photobooth-ldr`, lalu:
   ```bash
   npm install
   npm start
   ```
3. Buka **http://localhost:3000** di browser (Chrome / Edge / Firefox disarankan).
4. Untuk mencoba sendirian: buka dua tab, tab pertama klik **Buat Room Baru**, tab kedua masukkan kode room lalu **Gabung**. Izinkan akses kamera dan mikrofon.

> Catatan: kamera di browser hanya bisa dipakai lewat **localhost** atau **HTTPS**. Jadi agar pasanganmu di kota lain bisa ikut, aplikasi harus bisa diakses lewat HTTPS (pilih salah satu cara di bawah).

## Cara memakai berdua (jarak jauh)

### Opsi A — Tunnel cepat (tanpa hosting, cocok untuk dicoba)

Biarkan `npm start` berjalan, lalu di terminal lain pilih salah satu:

```bash
# Cloudflare (gratis, tanpa akun)
npx cloudflared tunnel --url http://localhost:3000

# atau ngrok (perlu akun gratis)
ngrok http 3000
```

Kamu akan mendapat alamat `https://...`. Buka alamat itu, buat room, lalu kirim **link room** ke pasanganmu. Komputermu harus tetap menyala selama sesi.

### Opsi B — Deploy ke hosting (link tetap, HTTPS otomatis)

Upload folder ini ke GitHub, lalu deploy sebagai **Web Service Node.js** di Render, Railway, Fly.io, atau sejenisnya:

- Build command: `npm install`
- Start command: `npm start`
- Port: otomatis dibaca dari variabel `PORT` (sudah didukung `server.js`)

Pastikan hosting yang dipilih mendukung **WebSocket** (Render, Railway, dan Fly.io mendukung).

## Alur pemakaian

1. Orang pertama isi nama, klik **Buat Room Baru**, lalu **🔗 Salin Link** dan kirim ke pasangan.
2. Pasangan membuka link, isi nama, klik **Gabung**.
3. Setelah video tersambung, pilih **Background** di panel kanan (pilihan otomatis ikut ke pasangan).
4. Pilih jumlah foto, klik **📷 Ambil Foto**. Countdown muncul di dua layar.
5. Atur warna frame dan caption, klik **Download PNG**.

## Tips & pemecahan masalah

| Masalah | Solusi |
|---|---|
| Kamera tidak menyala | Pakai `localhost` atau HTTPS, dan izinkan kamera di browser |
| Video pasangan tidak muncul / "gagal tersambung" | Beberapa jaringan memblokir koneksi langsung. Tambahkan server **TURN** di `ICE_SERVERS` pada `public/app.js` (layanan gratis/berbayar: Metered, Twilio, atau coturn sendiri) |
| Pilihan background abu-abu / tidak aktif | Model AI dimuat dari internet (`cdn.jsdelivr.net`). Cek koneksi lalu muat ulang |
| Video patah-patah | Pilih background **Asli** (paling ringan), tutup aplikasi berat lain, dan jaga tab tetap terbuka di depan (tab yang di-background akan membeku) |
| Suara berdengung | Pakai headset/earphone agar tidak terjadi echo |
| "Room penuh" | Satu room hanya untuk 2 orang. Buat room baru |

## Kustomisasi

- **Background baru**: tambah fungsi di objek `PRESETS` dan daftar `BG_LIST` pada `public/app.js`.
- **Ukuran video**: ubah `W` dan `H` di bagian atas `public/app.js` (default 640x480).
- **Tema warna**: ubah variabel `:root` di `public/style.css`.
- **Layout strip foto**: ubah ukuran `pad`, `cw`, `ch` di fungsi `renderResult()`.

## Privasi

Video dan suara dikirim langsung antar browser (peer-to-peer). Server hanya meneruskan pesan koneksi dan tidak menyimpan video maupun foto. Foto hanya dibuat dan disimpan di browser kalian masing-masing.
