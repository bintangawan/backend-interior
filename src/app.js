// ===============================================
//   IMPOR SEMUA LIBRARY YANG DIBUTUHKAN
// ===============================================
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const axios = require('axios'); // <-- Tambahkan ini
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================================
//   KONFIGURASI MIDDLEWARE, DB, & SESSION
// ===============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: 'http://localhost', credentials: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

const dbOptions = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'dbdesain'
};
const pool = mysql.createPool(dbOptions);
const sessionStore = new MySQLStore(dbOptions);

app.use(session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore, // <-- Menyimpan sesi ke database
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(passport.initialize());
app.use(passport.session());

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, 'uploads/'),
        filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
    })
});

// ===============================================
//   KONFIGURASI STRATEGI PASSPORT
// ===============================================
passport.use(new LocalStrategy({ usernameField: 'username' }, async (username, password, done) => {
    try {
        const [users] = await pool.execute("SELECT * FROM user WHERE username = ?", [username]);
        if (users.length === 0) return done(null, false, { message: 'Username tidak ditemukan.' });
        const user = users[0];
        if (!user.password) return done(null, false, { message: 'Akun ini terdaftar via Google. Silakan login dengan Google.' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return done(null, false, { message: 'Password salah.' });
        return done(null, user);
    } catch (err) { return done(err); }
}));

// Ganti blok Google Strategy Anda dengan yang ini
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    const { id: googleId, displayName, emails, photos } = profile;
    const email = emails[0].value;
    const photoUrl = photos[0].value;

    try {
        // --- LOGIKA BARU UNTUK DOWNLOAD GAMBAR ---
        // Buat nama file unik dan path lokal untuk gambar
        const localFileName = `${googleId}_${Date.now()}.jpg`;
        const localPath = path.join(__dirname, '..', 'uploads', localFileName);
        const dbPath = `uploads/${localFileName}`; // Path yang akan disimpan ke DB

        // Download gambar dari URL Google dan simpan ke path lokal
        const writer = fs.createWriteStream(localPath);
        const response = await axios({
            url: photoUrl,
            method: 'GET',
            responseType: 'stream'
        });
        response.data.pipe(writer);
        
        // Tunggu sampai gambar selesai di-download
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        // --- AKHIR LOGIKA DOWNLOAD ---

        // Cek apakah user dengan google_id ini sudah ada
        let [users] = await pool.execute("SELECT * FROM user WHERE google_id = ?", [googleId]);
        if (users.length > 0) {
            // Jika user sudah ada, update gambar profilnya jika berbeda
            if (users[0].gambar !== dbPath) {
                await pool.execute("UPDATE user SET gambar = ? WHERE google_id = ?", [dbPath, googleId]);
            }
            const [refreshedUser] = await pool.execute("SELECT * FROM user WHERE google_id = ?", [googleId]);
            return done(null, refreshedUser[0]);
        }
        
        // Cek apakah user dengan email yang sama sudah ada (dari registrasi manual)
        [users] = await pool.execute("SELECT * FROM user WHERE username = ?", [email]);
        if (users.length > 0) {
            // Update user yang ada dengan google_id dan gambar baru
            await pool.execute("UPDATE user SET google_id = ?, gambar = ? WHERE id = ?", [googleId, dbPath, users[0].id]);
            const [updatedUsers] = await pool.execute("SELECT * FROM user WHERE id = ?", [users[0].id]);
            return done(null, updatedUsers[0]);
        }

        // User benar-benar baru, buat entri baru dengan path gambar lokal
        const insertQuery = "INSERT INTO user (google_id, username, nama, gambar, posisi, penilaian) VALUES (?, ?, ?, ?, ?, ?)";
        const [result] = await pool.execute(insertQuery, [googleId, email, displayName, dbPath, 'User', 'Belum memberikan penilaian']);
        const [newUsers] = await pool.execute("SELECT * FROM user WHERE id = ?", [result.insertId]);
        return done(null, newUsers[0]);

    } catch (err) {
        console.error("Error in Google Strategy:", err);
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const [users] = await pool.execute("SELECT * FROM user WHERE id = ?", [id]);
        done(null, users.length > 0 ? users[0] : false);
    } catch (err) { done(err, null); }
});

// ===============================================
//   SEMUA ENDPOINTS APLIKASI
// ===============================================
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.status(401).json({ status: 'error', message: 'Unauthorized' });
};

// --- Endpoints Autentikasi ---
app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/api/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: 'http://localhost/webdesigninterior/dash2/login.php' }),
    (req, res) => res.redirect('http://localhost/webdesigninterior/dash2/index.php')
);

app.post('/api/register', upload.single('gambar'), async (req, res) => {
    try {
        const { nama, username, password, posisi } = req.body;
        if (!req.file || !nama || !username || !password || !posisi) {
            return res.status(400).json({ message: 'Semua field wajib diisi' });
        }
        const [existingUser] = await pool.execute("SELECT id FROM user WHERE username = ?", [username]);
        if (existingUser.length > 0) return res.status(409).json({ message: 'Username (email) sudah terdaftar' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const insertQuery = "INSERT INTO user (username, password, nama, gambar, posisi, penilaian) VALUES (?, ?, ?, ?, ?, ?)";
        await pool.execute(insertQuery, [username, hashedPassword, `uploads/${req.file.filename}`, posisi, 'Belum memberikan penilaian']);
        res.status(201).json({ status: 'success', message: 'Registrasi berhasil! Silakan login.' });
    } catch (error) {
        console.error("Error registrasi:", error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat registrasi.' });
    }
});

app.post('/api/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) return next(err);
        if (!user) return res.status(401).json({ message: info.message });
        req.logIn(user, (err) => {
            if (err) return next(err);
            return res.json({ status: 'success', message: 'Login berhasil', user: user });
        });
    })(req, res, next);
});

app.post('/api/logout', (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ status: 'success', message: 'Logout berhasil' });
      });
    });
});

app.get('/api/user', isAuthenticated, (req, res) => {
    res.json({ status: 'success', data: req.user });
});


// --- Endpoints Fungsional (Booking, Rating, dll.) ---
app.get('/api/bookings', isAuthenticated, async (req, res) => {
    try {
        const [rows] = await pool.execute("SELECT * FROM tblbooking WHERE username = ? ORDER BY tgl_masuk DESC", [req.user.username]);
        res.json({ status: 'success', data: rows });
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil data booking' });
    }
});

app.post('/api/bookings', isAuthenticated, async (req, res) => {
    try {
        const { kode_booking, tgl_masuk, nama, nohp, alamat, tipe_ruang, ukuran_ruang, preferensi, aksesoris, budget, tema } = req.body;
        const jenis_material = req.body.jenis_material ? req.body.jenis_material.join(', ') : '';
        const query = `INSERT INTO tblbooking (username, kode_booking, tgl_masuk, nama, nohp, alamat, tipe_ruang, ukuran_ruang, preferensi, aksesoris, budget, tema, jenis_material, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        await pool.execute(query, [req.user.username, kode_booking, tgl_masuk, nama, nohp, alamat, tipe_ruang, ukuran_ruang, preferensi, aksesoris, budget, tema, jenis_material, 'pending']);
        res.status(201).json({ status: 'success', message: 'Booking berhasil dikirim!' });
   
    // KODE BARU UNTUK DEBUGGING
} catch (error) {
    console.error("SQL ERROR:", error); // Tetap log di backend untuk kita lihat
    // Kirim pesan error asli ke frontend untuk debugging
    res.status(500).json({ 
        message: 'Terjadi error SQL, lihat detail di bawah.', 
        error_detail: error.message 
    });
}
});

app.get('/api/booking/new-code', isAuthenticated, async (req, res) => {
    try {
        const [rows] = await pool.execute("SELECT MAX(RIGHT(kode_booking, 3)) AS last_num FROM tblbooking");
        const lastNum = parseInt(rows[0].last_num, 10) || 0;
        const newCode = `b${String(lastNum + 1).padStart(3, '0')}`;
        res.json({ status: 'success', newBookingCode: newCode });
    } catch (error) {
        res.status(500).json({ message: 'Gagal membuat kode booking' });
    }
});

app.patch('/api/rating', isAuthenticated, async (req, res) => {
    try {
        const { penilaian } = req.body;
        if (!penilaian) return res.status(400).json({ message: 'Penilaian tidak boleh kosong.' });
        await pool.execute("UPDATE user SET penilaian = ? WHERE id = ?", [penilaian, req.user.id]);
        res.status(200).json({ status: 'success', message: 'Terima kasih, penilaian Anda telah kami simpan!' });
    } catch (error) {
        res.status(500).json({ message: 'Gagal menyimpan penilaian.' });
    }
});


// ===============================================
//   JALANKAN SERVER
// ===============================================
app.listen(PORT, () => {
    console.log(`🚀 Server Express berjalan di http://localhost:${PORT}`);
});