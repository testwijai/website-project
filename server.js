const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // ให้เข้าถึงไฟล์หน้าเว็บผ่าน http://localhost:5000 ได้ด้วย

// การตั้งค่าเชื่อมต่อ PostgreSQL (รองรับทั้ง localhost และ Cloud / Render)
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;
const pool = new Pool(
    process.env.DATABASE_URL
        ? {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        }
        : {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 5432,
            database: process.env.DB_NAME || 'postgres',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD,
            ssl: isProduction && process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : false
        }
);

// ฟังก์ชันเริ่มต้นสร้างตารางอัตโนมัติ (ถ้ายังไม่มีใน Database)
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS places (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                description TEXT,
                latitude DOUBLE PRECISION NOT NULL,
                longitude DOUBLE PRECISION NOT NULL,
                opening_hours VARCHAR(100) DEFAULT '08:00 - 18:00 น.',
                rating NUMERIC(2, 1) DEFAULT 4.5,
                image TEXT,
                time_spent INTEGER DEFAULT 60,
                open_days VARCHAR(50) DEFAULT '0,1,2,3,4,5,6',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // เพิ่ม column open_days ถ้ายังไม่มี (สำหรับ DB ที่มีอยู่แล้ว)
        await pool.query(`
            ALTER TABLE places ADD COLUMN IF NOT EXISTS open_days VARCHAR(50) DEFAULT '0,1,2,3,4,5,6';
        `);
        // อัปเดต open_days ที่เป็น null ให้ใช้ค่า default
        await pool.query(`
            UPDATE places SET open_days = '0,1,2,3,4,5,6' WHERE open_days IS NULL OR open_days = '';
        `);
        console.log('✅ ตรวจสอบตาราง places ใน PostgreSQL เรียบร้อย');

        // สร้างตาราง admins สำหรับเข้าสู่ระบบหลังบ้าน
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                fullname VARCHAR(100),
                role VARCHAR(20) DEFAULT 'admin',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // เพิ่มบัญชีแอดมินทั้ง 3 คนลงในฐานข้อมูล
        const defaultAdmins = [
            { username: 'Plab', password: '2004', fullname: 'Admin Plab' },
            { username: 'Apec', password: '1911', fullname: 'Admin Apec' },
            { username: 'Seen', password: '1402', fullname: 'Admin Seen' }
        ];

        for (const adm of defaultAdmins) {
            await pool.query(
                'INSERT INTO admins (username, password, fullname) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING',
                [adm.username, adm.password, adm.fullname]
            );
        }
        console.log('🔐 ตรวจสอบและตั้งค่าบัญชีแอดมินทั้ง 3 คน (Plab, Apec, Seen) เรียบร้อย');

        // ตรวจสอบว่ามีข้อมูลหรือยัง ถ้ายังไม่มีให้ใส่ข้อมูลเริ่มต้นให้อัตโนมัติ
        const countRes = await pool.query('SELECT COUNT(*) FROM places');
        if (parseInt(countRes.rows[0].count) === 0) {
            console.log('🌱 กำลังเพิ่มข้อมูลสถานที่เริ่มต้นลงในฐานข้อมูล...');
            const seedQuery = `
                INSERT INTO places (name, category, description, latitude, longitude, opening_hours, open_days, rating, image, time_spent)
                VALUES 
                ('พระมหาธาตุแก่นนคร (บึงแก่นนคร)', 'วัด/สถานที่ศักดิ์สิทธิ์', 'พระธาตุ 9 ชั้นที่สวยงามและเป็นสัญลักษณ์ของจังหวัดขอนแก่น มองเห็นวิวเมืองและบึงแก่นนครแบบ 360 องศา', 16.4172, 102.8344, '07:00 - 17:00 น.', '0,1,2,3,4,5,6', 4.8, 'https://images.unsplash.com/photo-1590766940554-638092019c00?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', 60),
                ('พิพิธภัณฑสถานแห่งชาติ ขอนแก่น', 'พิพิธภัณฑ์', 'แหล่งเรียนรู้ประวัติศาสตร์ โบราณคดี และศิลปวัฒนธรรมที่สำคัญของภาคอีสาน', 16.4402, 102.8362, '09:00 - 16:00 น. (ปิดจันทร์-อังคาร)', '3,4,5,6,0', 4.5, 'https://images.unsplash.com/photo-1541336032412-2048a678540d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', 90),
                ('ตลาดต้นตาล (Ton Tann Market)', 'ตลาด/ช้อปปิ้ง', 'ตลาดนัดกลางคืนสุดชิค รวมอาหารอร่อย สินค้าแฟชั่น และดนตรีสด', 16.4184, 102.8156, '16:00 - 23:00 น.', '0,1,2,3,4,5,6', 4.7, 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', 120),
                ('สวนสัตว์ขอนแก่น (เขาสวนกวาง)', 'ธรรมชาติ/สวนสัตว์', 'สวนสัตว์ขนาดใหญ่ท่ามกลางธรรมชาติ มี Sky walk ชมวิวสัตว์นานาชนิด', 16.8524, 102.8808, '08:00 - 16:30 น.', '0,1,2,3,4,5,6', 4.6, 'https://images.unsplash.com/photo-1534567153574-2b12153a87f0?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', 180),
                ('บึงสีฐาน มหาวิทยาลัยขอนแก่น', 'ธรรมชาติ', 'สถานที่พักผ่อนหย่อนใจ ลานศิลปวัฒนธรรม และจุดชมพระอาทิตย์ตกริมน้ำ', 16.4468, 102.8252, 'เปิด 24 ชั่วโมง', '0,1,2,3,4,5,6', 4.5, 'https://images.unsplash.com/photo-1506744626753-1fa44f4a4df2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', 60),
                ('Columbo Craft Village', 'คาเฟ่/ถ่ายรูป', 'หมู่บ้านงานคราฟต์สุดชิค บรรยากาศร่มรื่น คาเฟ่ เวิร์กช็อปศิลปะ', 16.4747, 102.8183, '09:00 - 18:00 น. (ปิดวันอังคาร)', '0,3,4,5,6', 4.4, 'https://images.unsplash.com/photo-1524143986875-3b098d78b363?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', 90),
                ('อุทยานแห่งชาติภูเวียง', 'ธรรมชาติ', 'แหล่งค้นพบซากฟอสซิลไดโนเสาร์แห่งแรกของไทย ธรรมชาติร่มรื่น', 16.6667, 102.2500, '08:30 - 16:30 น.', '0,1,2,3,4,5,6', 4.7, 'https://images.unsplash.com/photo-1518091043644-c1d44579d2c1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', 240);
            `;
            await pool.query(seedQuery);
            console.log('✅ เพิ่มข้อมูลเริ่มต้น 7 สถานที่เรียบร้อย');
        }
    } catch (err) {
        console.error('⚠️ ข้อผิดพลาดในการตรวจสอบฐานข้อมูล:', err.message);
        console.error('👉 กรุณาตรวจสอบว่ารหัสผ่านในไฟล์ .env ถูกต้องตรงกับใน pgAdmin หรือไม่');
    }
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// 1. Health check & DB Status
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            status: 'ok',
            database: 'connected',
            message: 'เชื่อมต่อ PostgreSQL สำเร็จ'
        });
    } catch (err) {
        res.status(500).json({
            status: 'error',
            database: 'disconnected',
            message: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้: ' + err.message
        });
    }
});

// Helper แปลงแถวจาก DB ให้เข้ากับระบบเดิม
function formatPlace(row) {
    return {
        id: String(row.id),
        name: row.name,
        category: row.category,
        description: row.description || '',
        lat: parseFloat(row.latitude),
        lng: parseFloat(row.longitude),
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        opening_hours: row.opening_hours || '08:00 - 18:00 น.',
        open_days: row.open_days || '0,1,2,3,4,5,6',
        rating: parseFloat(row.rating) || 4.5,
        image: row.image || '',
        timeSpent: parseInt(row.time_spent) || 60,
        time_spent: parseInt(row.time_spent) || 60,
        reviews: row.reviews || 85,
        created_at: row.created_at
    };
}

// 2. ดึงข้อมูลสถานที่ทั้งหมด (READ All)
app.get('/api/places', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM places ORDER BY id ASC');
        const places = result.rows.map(formatPlace);
        res.json({ success: true, count: places.length, data: places });
    } catch (err) {
        console.error('Error fetching places:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. ดึงข้อมูลสถานที่ 1 แห่งตาม ID (READ One)
app.get('/api/places/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM places WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบสถานที่นี้' });
        }
        res.json({ success: true, data: formatPlace(result.rows[0]) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. เพิ่มสถานที่ใหม่ (CREATE)
app.post('/api/places', async (req, res) => {
    try {
        const {
            name,
            category,
            description,
            latitude,
            lat,
            longitude,
            lng,
            opening_hours,
            openingHours,
            open_days,
            rating,
            image,
            time_spent,
            timeSpent
        } = req.body;

        const finalLat = parseFloat(latitude !== undefined ? latitude : lat);
        const finalLng = parseFloat(longitude !== undefined ? longitude : lng);
        const finalTime = parseInt(time_spent !== undefined ? time_spent : (timeSpent || 60));
        const finalHours = opening_hours || openingHours || '08:00 - 18:00 น.';
        const finalOpenDays = open_days || '0,1,2,3,4,5,6';
        const finalRating = parseFloat(rating) || 4.5;

        if (!name || !category || isNaN(finalLat) || isNaN(finalLng)) {
            return res.status(400).json({
                success: false,
                message: 'กรุณากรอกชื่อสถานที่ หมวดหมู่ และพิกัดละติจูด/ลองจิจูดให้ถูกต้อง'
            });
        }

        const query = `
            INSERT INTO places (name, category, description, latitude, longitude, opening_hours, open_days, rating, image, time_spent)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *;
        `;
        const values = [name, category, description || '', finalLat, finalLng, finalHours, finalOpenDays, finalRating, image || '', finalTime];
        const result = await pool.query(query, values);

        res.status(201).json({
            success: true,
            message: 'เพิ่มสถานที่เรียบร้อยแล้ว',
            data: formatPlace(result.rows[0])
        });
    } catch (err) {
        console.error('Error adding place:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 5. แก้ไขสถานที่ (UPDATE)
app.put('/api/places/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            category,
            description,
            latitude,
            lat,
            longitude,
            lng,
            opening_hours,
            openingHours,
            open_days,
            rating,
            image,
            time_spent,
            timeSpent
        } = req.body;

        const finalLat = parseFloat(latitude !== undefined ? latitude : lat);
        const finalLng = parseFloat(longitude !== undefined ? longitude : lng);
        const finalTime = parseInt(time_spent !== undefined ? time_spent : (timeSpent || 60));
        const finalHours = opening_hours || openingHours || '08:00 - 18:00 น.';
        const finalOpenDays = (open_days !== undefined && open_days !== null && String(open_days).trim() !== '')
            ? String(open_days).trim()
            : '0,1,2,3,4,5,6';
        const finalRating = parseFloat(rating) || 4.5;

        const query = `
            UPDATE places
            SET name = $1,
                category = $2,
                description = $3,
                latitude = $4,
                longitude = $5,
                opening_hours = $6,
                open_days = $7,
                rating = $8,
                image = $9,
                time_spent = $10
            WHERE id = $11
            RETURNING *;
        `;
        const values = [name, category, description || '', finalLat, finalLng, finalHours, finalOpenDays, finalRating, image || '', finalTime, id];
        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบสถานที่ที่ต้องการแก้ไข' });
        }

        res.json({
            success: true,
            message: 'อัปเดตข้อมูลสถานที่เรียบร้อยแล้ว',
            data: formatPlace(result.rows[0])
        });
    } catch (err) {
        console.error('Error updating place:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 6. ลบสถานที่ (DELETE)
app.delete('/api/places/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM places WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบสถานที่ที่ต้องการลบ' });
        }

        res.json({
            success: true,
            message: 'ลบสถานที่สำเร็จ',
            id: result.rows[0].id
        });
    } catch (err) {
        console.error('Error deleting place:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ----------------------------------------------------
// ADMIN AUTHENTICATION & MANAGEMENT ROUTES
// ----------------------------------------------------

// 7. เข้าสู่ระบบแอดมิน (Admin Login)
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
        }

        // 1. ตรวจสอบในตาราง admins ในฐานข้อมูล
        try {
            const result = await pool.query('SELECT * FROM admins WHERE username = $1 AND password = $2', [username, password]);
            if (result.rows.length > 0) {
                const admin = result.rows[0];
                const token = 'adm_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
                return res.json({
                    success: true,
                    message: 'เข้าสู่ระบบสำเร็จ',
                    token,
                    user: {
                        id: admin.id,
                        username: admin.username,
                        fullname: admin.fullname || admin.username,
                        role: admin.role || 'admin'
                    }
                });
            }
        } catch (dbErr) {
            console.warn('DB check error, checking fallback:', dbErr.message);
        }

        // 2. Fallback ตรวจสอบกับแอดมินทั้ง 3 คน (เผื่อกรณีฉุกเฉินหรือ DB อยู่ระหว่างเริ่มต้น)
        const fallbackAdmins = {
            'plab': { pass: '2004', name: 'Admin Plab' },
            'apec': { pass: '1911', name: 'Admin Apec' },
            'seen': { pass: '1402', name: 'Admin Seen' }
        };

        const lowerUser = username.toLowerCase();
        if (fallbackAdmins[lowerUser] && fallbackAdmins[lowerUser].pass === password) {
            const token = 'adm_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
            return res.json({
                success: true,
                message: 'เข้าสู่ระบบสำเร็จ',
                token,
                user: { id: 0, username: username, fullname: fallbackAdmins[lowerUser].name, role: 'admin' }
            });
        }

        return res.status(401).json({
            success: false,
            message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง'
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
    }
});

// 8. ดึงรายชื่อแอดมินทั้งหมด
app.get('/api/admin/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, fullname, role, created_at FROM admins ORDER BY id ASC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 9. เพิ่มแอดมินคนใหม่
app.post('/api/admin/users', async (req, res) => {
    try {
        const { username, password, fullname } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'กรุณากรอก Username และ Password' });
        }

        // เช็คว่า username ซ้ำหรือไม่
        const check = await pool.query('SELECT id FROM admins WHERE username = $1', [username]);
        if (check.rows.length > 0) {
            return res.status(400).json({ success: false, message: `Username "${username}" มีผู้ใช้งานแล้ว` });
        }

        const query = `
            INSERT INTO admins (username, password, fullname)
            VALUES ($1, $2, $3)
            RETURNING id, username, fullname, created_at;
        `;
        const result = await pool.query(query, [username, password, fullname || username]);
        res.status(201).json({
            success: true,
            message: `เพิ่มแอดมิน ${username} เรียบร้อยแล้ว`,
            data: result.rows[0]
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 10. แก้ไขข้อมูล / เปลี่ยนรหัสผ่านของแอดมิน
app.put('/api/admin/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { fullname, password } = req.body;

        if (password && password.trim() !== '') {
            await pool.query('UPDATE admins SET password = $1, fullname = COALESCE($2, fullname) WHERE id = $3', [password, fullname, id]);
        } else if (fullname) {
            await pool.query('UPDATE admins SET fullname = $1 WHERE id = $2', [fullname, id]);
        }

        res.json({ success: true, message: 'อัปเดตข้อมูลแอดมินเรียบร้อยแล้ว' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 11. ลบบัญชีแอดมิน
app.delete('/api/admin/users/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // เช็คจำนวนแอดมิน ต้องมีอย่างน้อย 1 คน
        const countRes = await pool.query('SELECT COUNT(*) FROM admins');
        if (parseInt(countRes.rows[0].count) <= 1) {
            return res.status(400).json({ success: false, message: 'ไม่สามารถลบได้ เนื่องจากต้องมีแอดมินอย่างน้อย 1 คน' });
        }

        await pool.query('DELETE FROM admins WHERE id = $1', [id]);
        res.json({ success: true, message: 'ลบบัญชีแอดมินเรียบร้อยแล้ว' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// เริ่มต้นเปิด Server
app.listen(PORT, async () => {
    console.log(`====================================================`);
    console.log(`🚀 Node.js Backend Server กำลังทำงานที่: http://localhost:${PORT}`);
    console.log(`📡 API Places: http://localhost:${PORT}/api/places`);
    console.log(`💻 เข้าหน้าแอดมิน: http://localhost:${PORT}/admin/index.html`);
    console.log(`====================================================`);
    await initDatabase();
});
