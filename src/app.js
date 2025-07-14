const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json()); // Untuk parsing application/json
app.use(express.urlencoded({ extended: true })); // Untuk parsing application/x-www-form-urlencoded

// 1. Konfigurasi CORS agar frontend PHP bisa mengakses API dan mengirim cookie
app.use(cors({
    origin: 'http://localhost', // Sesuaikan jika port XAMPP/server PHP Anda berbeda
    credentials: true // <-- WAJIB 'true' agar session cookie bisa diterima
}));

// 2. Buat folder 'uploads' dapat diakses secara publik
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// 3. Konfigurasi Multer untuk menangani upload file gambar
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Pastikan folder 'uploads' ada di root direktori proyek Anda
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Batas ukuran file 5MB (opsional)
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Hanya file gambar yang diizinkan!'), false);
        }
    }
});

// 4. Konfigurasi Session
app.use(session({
    secret: 'ganti-dengan-kunci-rahasia-yang-sangat-aman',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set 'true' jika Anda menggunakan HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // Session berlaku 24 jam
    }
}));

// 5. Konfigurasi Koneksi Database
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'dbdesain'
};
const pool = mysql.createPool(dbConfig);


// === ROUTES / ENDPOINTS ===

/**
 * 🚨 Peringatan Keamanan: Kode ini tidak menggunakan hashing password.
 * Di aplikasi produksi, Anda HARUS menggunakan library seperti 'bcrypt'
 * untuk mengamankan password pengguna.
 */

// Endpoint untuk Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username dan password wajib diisi' });
        }

    const query = "SELECT id, username, nama, password, gambar, posisi, penilaian FROM user WHERE username = ? AND password = ?";
    const [rows] = await pool.execute(query, [username, password]);

    if (rows.length > 0) {
        const user = rows[0];
        // Simpan semua data ke session
        req.session.user_id = user.id;
        req.session.username = user.username;
        req.session.nama = user.nama;
        req.session.gambar = user.gambar;
        req.session.posisi = user.posisi;
        req.session.penilaian = user.penilaian;
        
        res.json({ status: 'success', message: 'Login berhasil', user });
        } else {
            res.status(401).json({ message: 'Username atau password salah' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
});

// Endpoint untuk Registrasi
app.post('/api/register', upload.single('gambar'), async (req, res) => {
    try {
        const { nama, username, password, posisi } = req.body;
        
        if (!req.file || !nama || !username || !password || !posisi) {
            return res.status(400).json({ message: 'Semua field wajib diisi' });
        }
        
        const gambarPath = `uploads/${req.file.filename}`;
        const [existingUser] = await pool.execute("SELECT id FROM user WHERE username = ?", [username]);
        
        if (existingUser.length > 0) {
            return res.status(409).json({ message: 'Username sudah terdaftar' });
        }

        const insertQuery = "INSERT INTO user (nama, username, password, posisi, gambar, penilaian) VALUES (?, ?, ?, ?, ?, ?)";
        const penilaianDefault = 'Penilaian belum diberikan';
        
        const [result] = await pool.execute(insertQuery, [nama, username, password, posisi, gambarPath, penilaianDefault]);

        res.status(201).json({ status: 'success', message: 'Registrasi berhasil!', userId: result.insertId });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server' });
    }
});

/**
 * Endpoint untuk mengambil semua data booking milik pengguna yang sedang login.
 * Frontend bisa memanggil ini untuk halaman "Progress" atau "Riwayat Booking".
 */

app.get('/api/booking/new-code', async (req, res) => {
    // Pastikan user sudah login untuk bisa mendapatkan kode
    if (!req.session.user_id) {
        return res.status(401).json({ status: 'error', message: 'Anda harus login.' });
    }

    try {
        const query = "SELECT MAX(RIGHT(kode_booking, 3)) AS last_num FROM tblbooking";
        const [rows] = await pool.execute(query);
        // Ambil angka terakhir, jika tidak ada (tabel kosong), anggap 0
        const lastNum = parseInt(rows[0].last_num, 10) || 0;
        
        const newNum = lastNum + 1;
        // Format angka menjadi 3 digit dengan padding nol (contoh: 1 -> "001")
        const newCode = String(newNum).padStart(3, '0'); 
        const newBookingCode = `b${newCode}`;

        res.json({ status: 'success', newBookingCode: newBookingCode });
    } catch (error) {
        console.error("Error generating new booking code:", error);
        res.status(500).json({ status: 'error', message: 'Gagal membuat kode booking' });
    }
});

app.get('/api/bookings', async (req, res) => {
    // 1. Cek apakah pengguna sudah login
    if (!req.session.user_id) {
        return res.status(401).json({ status: 'error', message: 'Anda harus login untuk melihat data booking.' });
    }
    
    try {
        const username = req.session.username;
        const query = "SELECT * FROM tblbooking WHERE username = ? ORDER BY tgl_masuk DESC";
        const [rows] = await pool.execute(query, [username]);

        res.json({ status: 'success', data: rows });

    } catch (error) {
        console.error("Error fetching bookings:", error);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data booking' });
    }
});


/**
 * Endpoint untuk membuat booking baru.
 * Ini adalah pengganti utama dari proses_booking.php.
 */
app.post('/api/bookings', async (req, res) => {
    // 1. Cek apakah pengguna sudah login
    if (!req.session.user_id) {
        return res.status(401).json({ status: 'error', message: 'Anda harus login untuk membuat booking.' });
    }

    try {
        // 2. Ambil semua data dari body request
        const {
            username, kode_booking, tgl_masuk, nama, nohp, alamat, tipe_ruang, 
            ukuran_ruang, preferensi, aksesoris, budget, tema
        } = req.body;

        // 3. Validasi data (contoh sederhana)
        if (!nama || !nohp || !alamat || !tipe_ruang || !ukuran_ruang || !preferensi || !budget || !tema) {
            return res.status(400).json({ status: 'error', message: 'Harap lengkapi semua field yang wajib diisi.' });
        }

        // 4. Proses 'jenis_material' yang merupakan array dari checkbox
        // Sama seperti: $jenis_material = implode(",",$_POST['jenis_material']);
        const jenis_material = req.body.jenis_material ? req.body.jenis_material.join(', ') : '';
        
        // 5. Set status default ke 'pending'
        const status = 'pending';

        // 6. Gunakan prepared statements untuk keamanan (anti SQL Injection)
        const query = `
            INSERT INTO tblbooking (
                username, kode_booking, tgl_masuk, nama, nohp, alamat, tipe_ruang, 
                ukuran_ruang, preferensi, aksesoris, budget, tema, jenis_material, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await pool.execute(query, [
            username, kode_booking, tgl_masuk, nama, nohp, alamat, tipe_ruang,
            ukuran_ruang, preferensi, aksesoris, budget, tema, jenis_material, status
        ]);

        // 7. Kirim respons sukses
        res.status(201).json({ status: 'success', message: 'Booking berhasil dikirim!' });

    } catch (error) {
        console.error("Error creating booking:", error);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat memproses booking Anda.' });
    }
});

app.patch('/api/rating', async (req, res) => {
    // 1. Cek sesi: Pastikan pengguna sudah login.
    if (!req.session.user_id) {
        return res.status(401).json({ status: 'error', message: 'Anda harus login untuk memberi penilaian.' });
    }

    try {
        // 2. Ambil data 'penilaian' dari body request
        const { penilaian } = req.body;

        // 3. Validasi input
        if (!penilaian) {
            return res.status(400).json({ status: 'error', message: 'Penilaian tidak boleh kosong.' });
        }

        // 4. Ambil ID pengguna dari sesi (lebih aman daripada dari form)
        const userId = req.session.user_id;

        // 5. Query UPDATE yang aman menggunakan prepared statements
        const query = "UPDATE user SET penilaian = ? WHERE id = ?";
        await pool.execute(query, [penilaian, userId]);

        // 6. Kirim respons sukses
        res.status(200).json({ status: 'success', message: 'Terima kasih, penilaian Anda telah kami simpan!' });

    } catch (error) {
        console.error("Error updating rating:", error);
        res.status(500).json({ status: 'error', message: 'Gagal menyimpan penilaian.' });
    }
});

// Endpoint untuk Memeriksa Sesi
app.get('/api/session', (req, res) => {
    if (req.session.user_id) {
        res.json({
            status: 'success',
            data: {
                id: req.session.user_id,
                username: req.session.username,
                nama: req.session.nama,
                gambar: req.session.gambar,
                posisi: req.session.posisi, // Tambahkan ini
                penilaian: req.session.penilaian // Tambahkan ini
            }
        });
    } else {
        res.status(401).json({ status: 'error', message: 'Tidak ada sesi aktif' });
    }
});

// Endpoint untuk Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ status: 'error', message: 'Gagal logout' });
        }
        res.clearCookie('connect.sid');
        res.json({ status: 'success', message: 'Logout berhasil' });
    });
});

// Jalankan Server
app.listen(PORT, () => {
    console.log(`🚀 Server Express berjalan di http://localhost:${PORT}`);
});