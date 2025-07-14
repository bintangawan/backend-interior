
````markdown
# 🏠 Web Desain Interior — API Documentation

Dokumentasi RESTful API untuk aplikasi **Web Desain Interior**. Mendukung autentikasi manual dan Google, layanan booking, dan penilaian.

---

## 🧪 Pengujian Endpoint API

### 🔐 Autentikasi

#### 📌 `POST /api/register`
**Deskripsi:** Mendaftarkan pengguna baru secara manual.  
**Metode:** `POST`  
**Body:** `form-data` (karena mengunggah gambar)

| Field     | Tipe    | Wajib | Keterangan                  |
|-----------|---------|--------|-----------------------------|
| nama      | string  | ✔      | Nama lengkap pengguna       |
| username  | string  | ✔      | Email pengguna              |
| password  | string  | ✔      | Password                    |
| posisi    | string  | ✔      | Pekerjaan                   |
| gambar    | file    | ✔      | Gambar profil (upload file) |

✅ **Respons Sukses (201):**
```json
{
  "status": "success",
  "message": "Registrasi berhasil! Silakan login."
}
````

❌ **Respons Gagal (409):**

```json
{
  "message": "Username (email) sudah terdaftar"
}
```

---

#### 📌 `POST /api/login`

**Deskripsi:** Login untuk pengguna manual.
**Metode:** `POST`
**Body:** JSON

```json
{
  "username": "budi@example.com",
  "password": "password123"
}
```

✅ **Respons Sukses (200):**

```json
{
  "status": "success",
  "message": "Login berhasil",
  "user": {
    "id": 1,
    "google_id": null,
    "username": "budi@example.com",
    "password": "password123",
    "nama": "Budi Darmawan"
  }
}
```

❌ **Respons Gagal (401):**

```json
{
  "message": "Password salah."
}
```

---

#### 📌 `GET /api/auth/google`

**Deskripsi:** Autentikasi melalui Google.
**Metode:** `GET`

🧪 **Cara Uji:** Buka URL ini di browser:

```
http://localhost:3000/api/auth/google
```

Setelah login dengan akun Google, Anda akan diarahkan ke `/api/auth/google/callback` → menuju `index.php`.

---

#### 📌 `GET /api/user`

**Deskripsi:** Mendapatkan data pengguna yang sedang login.
**Metode:** `GET`

✅ **Respons Sukses (200):**

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "google_id": null,
    "username": "budi@example.com"
  }
}
```

❌ **Respons Gagal (401):**

```json
{
  "status": "error",
  "message": "Unauthorized"
}
```

---

#### 📌 `POST /api/logout`

**Deskripsi:** Logout dari sesi saat ini.
**Metode:** `POST`

✅ **Respons (200):**

```json
{
  "status": "success",
  "message": "Logout berhasil"
}
```

---

## 🛋️ Booking

#### 📌 `GET /api/booking/new-code`

**Deskripsi:** Mendapatkan kode booking baru.
**Metode:** `GET`

✅ **Respons (200):**

```json
{
  "status": "success",
  "newBookingCode": "b001"
}
```

---

#### 📌 `GET /api/bookings`

**Deskripsi:** Menampilkan riwayat booking pengguna yang login.
**Metode:** `GET`

✅ **Respons (200):**

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "kode_booking": "b001",
      "nama": "Budi Darmawan",
      "status": "pending"
    }
  ]
}
```

---

#### 📌 `POST /api/bookings`

**Deskripsi:** Mengirim data booking baru dari form.
**Metode:** `POST`
**Body:** JSON

```json
{
  "username": "budi@example.com",
  "kode_booking": "b001",
  "tgl_masuk": "2025-07-14",
  "nama": "Budi Darmawan",
  "nohp": "08123456789",
  "alamat": "Jl. Merdeka No. 10",
  "tipe_ruang": "livingroom",
  "ukuran_ruang": "5x5 m",
  "preferensi": "Tema minimalis dengan sentuhan kayu.",
  "aksesoris": "Lampu gantung, karpet",
  "budget": 5000000,
  "tema": "modern",
  "jenis_material": ["kayu", "logam"]
}
```

✅ **Respons Sukses (201):**

```json
{
  "status": "success",
  "message": "Booking berhasil dikirim!"
}
```

---

## ⭐ Penilaian

#### 📌 `PATCH /api/rating`

**Deskripsi:** Memberikan atau memperbarui penilaian.
**Metode:** `PATCH`
**Body:** JSON

```json
{
  "penilaian": "Pengerjaannya sangat rapi dan tepat waktu. Sangat direkomendasikan!"
}
```

✅ **Respons Sukses (200):**

```json
{
  "status": "success",
  "message": "Terima kasih, penilaian Anda telah kami simpan!"
}
```

❌ **Respons Gagal (400):**

```json
{
  "status": "error",
  "message": "Penilaian tidak boleh kosong."
}
```

---

## ⚙️ Teknologi Digunakan

* **PHP Native**
* **MySQL**
* **Session-based Auth**
* **Google OAuth 2.0**

---

## 📌 Catatan Pengujian

* Gunakan **Postman** untuk menguji semua endpoint **kecuali Google Auth**.
* Gunakan `form-data` untuk upload gambar saat register.
* Pastikan server local Anda berjalan di `localhost` atau `127.0.0.1`.

---

## 🧑‍💻 Kontribusi

Silakan kontribusi melalui pull request atau saran melalui issue.
---

© 2025 Web Desain Interior — API Team
