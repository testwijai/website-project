// การตั้งค่า API URL ของ Node.js Backend (ตรวจจับอัตโนมัติระหว่าง localhost กับเซิร์ฟเวอร์จริง)
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000/api'
    : 'https://testwijai-backend-eo0d.onrender.com/api';

let placesData = [];
let isServerOnline = false;

document.addEventListener('DOMContentLoaded', () => {
    // แสดงชื่อผู้ใช้แอดมินปัจจุบัน
    const adminUser = sessionStorage.getItem('admin_user') || 'admin';
    const userEl = document.getElementById('current-admin-user');
    if (userEl) userEl.textContent = adminUser;

    // 1. ตรวจสอบสถานะการเชื่อมต่อ Database ทันทีที่เปิดหน้าเว็บ
    checkDatabaseConnection();

    // 2. โหลดข้อมูลสถานที่
    loadDataFromAPI();

    // 3. ผูก Event ฟอร์มบันทึกข้อมูล
    const form = document.getElementById('place-form');
    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            saveFormData();
        });
    }
});

// ตรวจสอบสถานะ Database & Server
async function checkDatabaseConnection() {
    const banner = document.getElementById('db-status-bar');
    const text = document.getElementById('db-status-text');

    try {
        const res = await fetch(`${API_BASE_URL}/health`);
        const data = await res.json();

        if (res.ok && data.database === 'connected') {
            isServerOnline = true;
            banner.className = 'db-status-banner connected';
            text.innerHTML = '<i class="fa-solid fa-circle-check"></i> <strong>เชื่อมต่อสำเร็จ';
        } else {
            throw new Error(data.message || 'Database error');
        }
    } catch (err) {
        isServerOnline = false;
        banner.className = 'db-status-banner disconnected';
        text.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <strong>ยังไม่ได้เปิด Node.js Server หรือต่อ Database ไม่ได้:</strong> รันคำสั่ง <code>node server.js</code> ในโฟลเดอร์โปรเจกต์ และเช็ครหัสผ่านในไฟล์ <code>.env</code> (ขณะนี้ใช้ข้อมูลจำลองชั่วคราว)';
    }
}

// โหลดข้อมูลสถานที่จาก API
async function loadDataFromAPI() {
    const tbody = document.getElementById('places-table-body');
    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                <i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...
            </td>
        </tr>
    `;

    try {
        const res = await fetch(`${API_BASE_URL}/places`);
        if (!res.ok) throw new Error('API request failed');
        const json = await res.json();

        placesData = json.data || [];
        isServerOnline = true;
    } catch (err) {
        console.warn('ไม่สามารถดึงข้อมูลจาก API ได้ กำลังใช้ข้อมูลจาก LocalStorage สำรอง:', err);
        // Fallback ไปใช้ getPlaces() จาก data.js
        if (typeof getPlaces === 'function') {
            placesData = getPlaces();
        } else {
            placesData = [];
        }
    }

    updateStats();
    filterPlaces();
}

// อัปเดตตัวเลขสถิติต่างๆ ด้านบน
function updateStats() {
    document.getElementById('stat-total').textContent = placesData.length;

    const uniqueCats = new Set(placesData.map(p => p.category));
    document.getElementById('stat-categories').textContent = uniqueCats.size;

    if (placesData.length > 0) {
        const avg = placesData.reduce((acc, p) => acc + (parseFloat(p.rating) || 0), 0) / placesData.length;
        document.getElementById('stat-avg-rating').textContent = avg.toFixed(1);
    } else {
        document.getElementById('stat-avg-rating').textContent = '0.0';
    }
}

// กรองข้อมูลตามคำค้นหาและหมวดหมู่
function filterPlaces() {
    const query = (document.getElementById('admin-search')?.value || '').toLowerCase().trim();
    const cat = document.getElementById('admin-filter-cat')?.value || '';

    const filtered = placesData.filter(place => {
        const matchName = place.name.toLowerCase().includes(query) || (place.description || '').toLowerCase().includes(query);
        const matchCat = !cat || place.category === cat;
        return matchName && matchCat;
    });

    renderTable(filtered);
}

// หน้าที่ช่วย: แปลง open_days string เป็น pill HTML
function renderOpenDaysPills(openDays) {
    const dayNames = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
    const dayColors = ['#FECACA', '#DBEAFE', '#FEF3C7', '#D1FAE5', '#EDE9FE', '#FFE4E6', '#FEF9C3'];
    const dayTextColors = ['#991B1B', '#1E40AF', '#92400E', '#065F46', '#5B21B6', '#9F1239', '#713F12'];
    const days = openDays ? openDays.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d)) : [0,1,2,3,4,5,6];
    if (days.length === 7) return `<span style="color:#059669; font-size:0.8rem; font-weight:500;"><i class="fa-solid fa-circle-check"></i> ทุกวัน</span>`;
    return days.sort((a,b)=>a-b).map(d => `<span style="background:${dayColors[d]}; color:${dayTextColors[d]}; padding:2px 7px; border-radius:12px; font-size:0.75rem; font-weight:600; margin:1px;">${dayNames[d]}</span>`).join('');
}

// เรนเดอร์ตารางสถานที่
function renderTable(list) {
    const tbody = document.getElementById('places-table-body');
    tbody.innerHTML = '';

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
                    <i class="fa-solid fa-box-open" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; opacity: 0.5;"></i>
                    ไม่พบข้อมูลสถานที่
                </td>
            </tr>
        `;
        return;
    }

    list.forEach(place => {
        const tr = document.createElement('tr');
        const imgUrl = place.image || 'https://images.unsplash.com/photo-1590766940554-638092019c00?w=200';
        const rating = place.rating ? parseFloat(place.rating).toFixed(1) : '4.5';
        const hours = place.opening_hours || place.openingHours || '08:00 - 18:00 น.';
        const lat = place.latitude !== undefined ? place.latitude : place.lat;
        const lng = place.longitude !== undefined ? place.longitude : place.lng;
        const openDaysHtml = renderOpenDaysPills(place.open_days);

        tr.innerHTML = `
            <td>
                <img src="${imgUrl}" class="table-img" alt="${place.name}" onerror="this.src='https://images.unsplash.com/photo-1590766940554-638092019c00?w=200'">
            </td>
            <td>
                <strong>${place.name}</strong>
                <div style="font-size: 0.8rem; color: var(--text-muted); max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${place.description || 'ไม่มีรายละเอียด'}
                </div>
            </td>
            <td><span class="badge-cat">${place.category}</span></td>
            <td><span class="hours-pill"><i class="fa-regular fa-clock"></i> ${hours}</span></td>
            <td><div style="display:flex; flex-wrap:wrap; gap:2px; max-width:120px;">${openDaysHtml}</div></td>
            <td><span class="rating-pill"><i class="fa-solid fa-star"></i> ${rating}</span></td>
            <td><span class="coord-text">${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}</span></td>
            <td style="text-align: center;">
                <button class="action-btn edit" onclick="editPlace('${place.id}')" title="แก้ไข">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="action-btn delete" onclick="deletePlace('${place.id}')" title="ลบ">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Modal ควบคุมการเปิดปิด
const modal = document.getElementById('placeModal');

function openModal() {
    document.getElementById('place-form').reset();
    document.getElementById('place-id').value = '';
    document.getElementById('place-opening-hours').value = '08:00 - 18:00 น.';
    document.getElementById('place-rating').value = '4.5';
    document.getElementById('image-preview-container').style.display = 'none';
    document.getElementById('modal-title').innerHTML = '<i class="fa-solid fa-plus-circle"></i> เพิ่มสถานที่ใหม่';
    // เซ็ตวันที่เปิดทำการเป็นทุกวัน (default)
    document.querySelectorAll('input[name="open_day"]').forEach(cb => cb.checked = true);
    modal.style.display = 'block';
}

function closeModal() {
    modal.style.display = 'none';
}

function previewImage(url) {
    const container = document.getElementById('image-preview-container');
    const img = document.getElementById('image-preview');
    if (url && url.startsWith('http')) {
        img.src = url;
        container.style.display = 'flex';
    } else {
        container.style.display = 'none';
    }
}

// ฟังก์ชันแก้ไขสถานที่ (เปิด Modal พร้อมเติมข้อมูลเดิม)
function editPlace(id) {
    const place = placesData.find(p => String(p.id) === String(id));
    if (!place) return;

    document.getElementById('place-id').value = place.id;
    document.getElementById('place-name').value = place.name;
    document.getElementById('place-desc').value = place.description || '';
    document.getElementById('place-image').value = place.image || '';
    document.getElementById('place-category').value = place.category;
    document.getElementById('place-opening-hours').value = place.opening_hours || place.openingHours || '08:00 - 18:00 น.';
    document.getElementById('place-rating').value = place.rating || 4.5;
    document.getElementById('place-lat').value = place.latitude !== undefined ? place.latitude : place.lat;
    document.getElementById('place-lng').value = place.longitude !== undefined ? place.longitude : place.lng;

    // เซ็ต checkbox วันที่เปิดทำการ (รองรับ null / undefined / "undefined" / ค่าว่าง)
    const rawOpenDays = place.open_days;
    console.log(`[editPlace] id=${id} | open_days from API: "${rawOpenDays}" (type: ${typeof rawOpenDays})`);

    // แปลงค่าดิบเป็น array ตัวเลข 0-6 อย่างปลอดภัย
    const VALID_DAYS = ['0', '1', '2', '3', '4', '5', '6'];
    let openDaysList;

    const rawStr = (rawOpenDays !== null && rawOpenDays !== undefined)
        ? String(rawOpenDays).trim()
        : '';

    if (rawStr === '' || rawStr === 'undefined' || rawStr === 'null') {
        // ค่าผิดปกติ → ติ๊กครบทุกวัน (default)
        openDaysList = [...VALID_DAYS];
    } else {
        openDaysList = rawStr
            .split(',')
            .map(d => String(d).trim())
            .filter(d => VALID_DAYS.includes(d)); // กรองเฉพาะตัวเลข 0-6

        // ถ้ากรองแล้วไม่เหลืออะไรเลย → fallback ครบทุกวัน
        if (openDaysList.length === 0) {
            openDaysList = [...VALID_DAYS];
        }
    }

    document.querySelectorAll('input[name="open_day"]').forEach(cb => {
        cb.checked = openDaysList.includes(String(cb.value));
    });

    console.log(`[editPlace] openDaysList: [${openDaysList.join(',')}] | checkboxes set`);

    previewImage(place.image);

    document.getElementById('modal-title').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> แก้ไขสถานที่';
    modal.style.display = 'block';
}

// บันทึกข้อมูล (ทั้ง เพิ่มใหม่ และ แก้ไข)
async function saveFormData() {
    const id = document.getElementById('place-id').value;
    const saveBtn = document.getElementById('save-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';

    const existingPlace = id ? placesData.find(p => String(p.id) === String(id)) : null;
    const defaultTimeSpent = (existingPlace && (existingPlace.time_spent || existingPlace.timeSpent)) || 60;

    // อ่าน open_days จาก checkboxes และ sort ให้เป็นระเบียบก่อน join
    const checkedDays = Array.from(document.querySelectorAll('input[name="open_day"]:checked'))
        .map(cb => parseInt(cb.value, 10))
        .filter(v => !isNaN(v))
        .sort((a, b) => a - b)
        .map(v => String(v));
    const finalOpenDays = checkedDays.length > 0 ? checkedDays.join(',') : '0,1,2,3,4,5,6';

    console.log(`[saveFormData] id=${id || '(new)'} | open_days to send: "${finalOpenDays}"`);

    const payload = {
        name: document.getElementById('place-name').value.trim(),
        category: document.getElementById('place-category').value,
        description: document.getElementById('place-desc').value.trim(),
        latitude: parseFloat(document.getElementById('place-lat').value),
        lat: parseFloat(document.getElementById('place-lat').value),
        longitude: parseFloat(document.getElementById('place-lng').value),
        lng: parseFloat(document.getElementById('place-lng').value),
        opening_hours: document.getElementById('place-opening-hours').value.trim(),
        open_days: finalOpenDays,
        rating: parseFloat(document.getElementById('place-rating').value),
        image: document.getElementById('place-image').value.trim(),
        time_spent: defaultTimeSpent,
        timeSpent: defaultTimeSpent
    };

    console.log('[saveFormData] payload:', JSON.stringify(payload));

    try {
        // ลอง fetch ใหม่ถ้า isServerOnline ยังเป็น false (เช่น server Render เพิ่งตื่น)
        if (!isServerOnline) {
            try {
                const healthRes = await fetch(`${API_BASE_URL}/health`);
                const healthData = await healthRes.json();
                if (healthRes.ok && healthData.database === 'connected') {
                    isServerOnline = true;
                    console.log('[saveFormData] Server came online, switching to API mode');
                }
            } catch (_) { /* ยังออฟไลน์อยู่ */ }
        }

        if (isServerOnline) {
            let res;
            if (id) {
                // แก้ไขข้อมูล (PUT)
                res = await fetch(`${API_BASE_URL}/places/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                // เพิ่มข้อมูลใหม่ (POST)
                res = await fetch(`${API_BASE_URL}/places`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            const resData = await res.json();
            console.log('[saveFormData] API response:', resData);
            if (!res.ok) throw new Error(resData.message || 'บันทึกข้อมูลไม่สำเร็จ');

            showToast(id ? '✅ แก้ไขข้อมูลลง PostgreSQL สำเร็จ' : '✅ เพิ่มสถานที่ใหม่ลง PostgreSQL สำเร็จ');
            await loadDataFromAPI();
        } else {
            // โหมดสำรอง (Fallback LocalStorage)
            if (id) {
                const idx = placesData.findIndex(p => String(p.id) === String(id));
                if (idx > -1) placesData[idx] = { ...payload, id };
            } else {
                payload.id = 'local_' + Date.now();
                placesData.unshift(payload);
            }
            if (typeof savePlaces === 'function') savePlaces(placesData);
            showToast('⚠️ บันทึกใน LocalStorage (ยังไม่ได้เชื่อม Node.js Server)');
            updateStats();
            filterPlaces();
        }

        closeModal();
    } catch (err) {
        console.error('[saveFormData] Error:', err);
        alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> บันทึกข้อมูลลงฐานข้อมูล';
    }
}

// ลบสถานที่ (DELETE)
async function deletePlace(id) {
    const place = placesData.find(p => String(p.id) === String(id));
    const placeName = place ? place.name : 'สถานที่นี้';

    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ "${placeName}" ออกจากฐานข้อมูล?`)) {
        return;
    }

    try {
        if (isServerOnline) {
            const res = await fetch(`${API_BASE_URL}/places/${id}`, {
                method: 'DELETE'
            });
            const resData = await res.json();
            if (!res.ok) throw new Error(resData.message || 'ไม่สามารถลบได้');

            showToast('🗑️ ลบสถานที่ออกจาก PostgreSQL เรียบร้อย');
            await loadDataFromAPI();
        } else {
            placesData = placesData.filter(p => String(p.id) !== String(id));
            if (typeof savePlaces === 'function') savePlaces(placesData);
            showToast('🗑️ ลบข้อมูลใน LocalStorage เรียบร้อย');
            updateStats();
            filterPlaces();
        }
    } catch (err) {
        alert('เกิดข้อผิดพลาดในการลบ: ' + err.message);
    }
}

// แจ้งเตือน Toast Notification
function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

// ฟังก์ชันออกจากระบบแอดมิน (Logout)
function logoutAdmin() {
    if (confirm('คุณต้องการออกจากระบบผู้ดูแลระบบใช่หรือไม่?')) {
        sessionStorage.removeItem('admin_token');
        sessionStorage.removeItem('admin_user');
        sessionStorage.removeItem('admin_username');
        sessionStorage.removeItem('admin_id');
        window.location.replace('login.html');
    }
}

// ========================================================
// จัดการบัญชีผู้ดูแลระบบ (Admin Users Management)
// ========================================================
const adminModal = document.getElementById('adminManageModal');

function openAdminModal() {
    loadAdminUsers();
    adminModal.style.display = 'block';
}

function closeAdminModal() {
    adminModal.style.display = 'none';
}

async function loadAdminUsers() {
    const tbody = document.getElementById('admin-users-list');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 1.5rem;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลด...</td></tr>';

    try {
        const res = await fetch(`${API_BASE_URL}/admin/users`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.message);

        const users = json.data || [];
        tbody.innerHTML = '';

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">ไม่พบข้อมูลแอดมิน</td></tr>';
            return;
        }

        const currentUsername = sessionStorage.getItem('admin_username');

        users.forEach(u => {
            const tr = document.createElement('tr');
            const isMe = currentUsername && u.username === currentUsername;

            tr.innerHTML = `
                <td>
                    <strong>${u.fullname || u.username}</strong>
                    ${isMe ? '<span style="font-size:0.75rem; background:#D1FAE5; color:#065F46; padding:2px 8px; border-radius:10px; margin-left:6px; font-weight:600;">บัญชีของคุณ</span>' : ''}
                </td>
                <td><code>@${u.username}</code></td>
                <td><span style="letter-spacing: 2px; color: var(--text-muted); font-size: 1.1rem;">••••••••</span></td>
                <td style="text-align: center;">
                    <button class="action-btn" onclick="promptChangePassword('${u.id}', '${u.username}')" title="เปลี่ยนรหัสผ่าน">
                        <i class="fa-solid fa-key" style="color: #D97706;"></i>
                    </button>
                    ${users.length > 1 ? `
                        <button class="action-btn delete" onclick="deleteAdminUser('${u.id}', '${u.username}')" title="ลบบัญชีนี้">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    ` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">โหลดไม่สำเร็จ: ${err.message}</td></tr>`;
    }
}

async function handleCreateAdmin(e) {
    e.preventDefault();
    const fullname = document.getElementById('new-admin-fullname').value.trim();
    const username = document.getElementById('new-admin-username').value.trim();
    const password = document.getElementById('new-admin-password').value.trim();

    try {
        const res = await fetch(`${API_BASE_URL}/admin/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullname, username, password })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message);

        showToast(`✅ เพิ่มแอดมิน @${username} เรียบร้อยแล้ว`);
        document.getElementById('add-admin-form').reset();
        await loadAdminUsers();
    } catch (err) {
        alert(err.message);
    }
}

async function promptChangePassword(id, username) {
    const newPass = prompt(`กรุณาตั้งรหัสผ่านใหม่สำหรับแอดมิน "@${username}":`);
    if (!newPass || newPass.trim() === '') return;

    try {
        const res = await fetch(`${API_BASE_URL}/admin/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPass.trim() })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message);

        showToast(`🔑 เปลี่ยนรหัสผ่านของ @${username} สำเร็จ`);
        await loadAdminUsers();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteAdminUser(id, username) {
    const currentUsername = sessionStorage.getItem('admin_username');
    if (username === currentUsername) {
        if (!confirm(`คุณกำลังจะลบบัญชีของตัวเอง (@${username}) ใช่หรือไม่?`)) return;
    } else {
        if (!confirm(`ยืนยันการลบบัญชีแอดมิน "@${username}" ใช่หรือไม่?`)) return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/admin/users/${id}`, {
            method: 'DELETE'
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message);

        showToast(`🗑️ ลบบัญชีแอดมิน @${username} เรียบร้อย`);
        if (username === currentUsername) {
            logoutAdmin();
        } else {
            await loadAdminUsers();
        }
    } catch (err) {
        alert(err.message);
    }
}

// ปิด Modal เมื่อคลิกพื้นหลังด้านนอก
window.onclick = function (event) {
    if (event.target === modal) {
        closeModal();
    }
    if (event.target === adminModal) {
        closeAdminModal();
    }
};
