const categories = ["วัด/สถานที่ศักดิ์สิทธิ์", "ธรรมชาติ", "คาเฟ่/ถ่ายรูป", "ตลาด/ช้อปปิ้ง", "พิพิธภัณฑ์", "ธรรมชาติ/สวนสัตว์"];
const adjectives = ["สวยงาม", "ร่มรื่น", "ชิคๆ", "โบราณ", "ริมน้ำ", "ในสวน", "กลางเมือง", "ลึกลับ", "วินเทจ", "มินิมอล", "ย้อนยุค"];
const nouns = ["คาเฟ่", "วัด", "ตลาด", "สวน", "พิพิธภัณฑ์", "จุดชมวิว", "อุทยาน", "น้ำตก", "ฟาร์ม", "หอศิลป์"];

function generateDummyPlaces(count = 7) {
    const places = [
        {
            id: "1", name: "พระมหาธาตุแก่นนคร (บึงแก่นนคร)", description: "พระธาตุเก่าแก่คู่บ้านคู่เมืองขอนแก่น", image: "img/wat_phra_that.jpg", category: "วัด/สถานที่ศักดิ์สิทธิ์", lat: 16.4172, lng: 102.8344, latitude: 16.4172, longitude: 102.8344, timeSpent: 60, rating: 4.8, reviews: 1250, opening_hours: "07:00 - 17:00 น.", open_days: "0,1,2,3,4,5,6"
        },
        {
            id: "2", name: "พิพิธภัณฑสถานแห่งชาติ ขอนแก่น", description: "แหล่งเรียนรู้ประวัติศาสตร์และโบราณคดีที่สำคัญของอีสาน", image: "https://images.unsplash.com/photo-1541336032412-2048a678540d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", category: "พิพิธภัณฑ์", lat: 16.4402, lng: 102.8362, latitude: 16.4402, longitude: 102.8362, timeSpent: 90, rating: 4.5, reviews: 340, opening_hours: "09:00 - 16:00 น.", open_days: "3,4,5,6,0"
        },
        {
            id: "3", name: "ตลาดต้นตาล", description: "ตลาดนัดกลางคืนสุดฮิต แหล่งช้อปปิ้งและรวมร้านอาหารอร่อย", image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", category: "ตลาด/ช้อปปิ้ง", lat: 16.4184, lng: 102.8156, latitude: 16.4184, longitude: 102.8156, timeSpent: 120, rating: 4.7, reviews: 2100, opening_hours: "16:00 - 23:00 น.", open_days: "0,1,2,3,4,5,6"
        },
        {
            id: "4", name: "สวนสัตว์ขอนแก่น (เขาสวนกวาง)", description: "สวนสัตว์ขนาดใหญ่ มี Sky walk ชมวิว และสัตว์นานาชนิด", image: "https://images.unsplash.com/photo-1534567153574-2b12153a87f0?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", category: "ธรรมชาติ/สวนสัตว์", lat: 16.8524, lng: 102.8808, latitude: 16.8524, longitude: 102.8808, timeSpent: 180, rating: 4.6, reviews: 1560, opening_hours: "08:00 - 16:30 น.", open_days: "0,1,2,3,4,5,6"
        },
        {
            id: "5", name: "บึงสีฐาน มหาวิทยาลัยขอนแก่น", description: "สถานที่พักผ่อนหย่อนใจ ออกกำลังกาย และชมพระอาทิตย์ตกสวยงาม", image: "https://images.unsplash.com/photo-1506744626753-1fa44f4a4df2?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", category: "ธรรมชาติ", lat: 16.4468, lng: 102.8252, latitude: 16.4468, longitude: 102.8252, timeSpent: 60, rating: 4.5, reviews: 890, opening_hours: "เปิด 24 ชั่วโมง", open_days: "0,1,2,3,4,5,6"
        },
        {
            id: "6", name: "Columbo Craft Village", description: "หมู่บ้านงานคราฟต์สุดชิค มุมถ่ายรูปเพียบ มีคาเฟ่และร้านอาหาร", image: "https://images.unsplash.com/photo-1524143986875-3b098d78b363?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", category: "คาเฟ่/ถ่ายรูป", lat: 16.4747, lng: 102.8183, latitude: 16.4747, longitude: 102.8183, timeSpent: 90, rating: 4.4, reviews: 420, opening_hours: "09:00 - 18:00 น.", open_days: "0,3,4,5,6,1"
        },
        {
            id: "7", name: "อุทยานแห่งชาติภูเวียง", description: "แหล่งค้นพบฟอสซิลไดโนเสาร์แห่งแรกของไทย ธรรมชาติร่มรื่น", image: "https://images.unsplash.com/photo-1518091043644-c1d44579d2c1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", category: "ธรรมชาติ", lat: 16.6667, lng: 102.2500, latitude: 16.6667, longitude: 102.2500, timeSpent: 240, rating: 4.7, reviews: 750, opening_hours: "08:30 - 16:30 น.", open_days: "0,1,2,3,4,5,6"
        }
    ];

    if (count > places.length) {
        for(let i = places.length; i < count; i++) {
            const cat = categories[Math.floor(Math.random() * categories.length)];
            const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
            const noun = nouns[Math.floor(Math.random() * nouns.length)];
            const lat = 16.4322 + (Math.random() - 0.5) * 0.15;
            const lng = 102.8236 + (Math.random() - 0.5) * 0.15;
            
            places.push({
                id: `gen_p${i}`,
                name: `${noun}${adj} ${i}`,
                description: `สถานที่ท่องเที่ยวประเภท ${cat} ในขอนแก่น เหมาะสำหรับการมาพักผ่อน`,
                image: `https://picsum.photos/seed/kk${i}/800/500`,
                category: cat,
                lat: lat,
                lng: lng,
                latitude: lat,
                longitude: lng,
                timeSpent: 60,
                rating: (3.5 + Math.random() * 1.5).toFixed(1),
                reviews: Math.floor(Math.random() * 500) + 10,
                opening_hours: "08:00 - 18:00 น.",
                open_days: "0,1,2,3,4,5,6"
            });
        }
    }
    return places;
}

// โหลดข้อมูลเริ่มต้นเฉพาะกรณีที่ LocalStorage ว่างเปล่าจริง ๆ เท่านั้น
let currentStored = localStorage.getItem('kk_places');
if (!currentStored || currentStored === '[]') {
    const defaultPlaces = generateDummyPlaces(7);
    localStorage.setItem('kk_places', JSON.stringify(defaultPlaces));
}

// Utility functions สำหรับทุกหน้าเว็บ
function getPlaces() {
    try {
        const stored = localStorage.getItem('kk_places');
        if (!stored) return [];
        const list = JSON.parse(stored);
        return list.map(p => ({
            ...p,
            id: String(p.id),
            lat: p.latitude !== undefined ? parseFloat(p.latitude) : parseFloat(p.lat || 0),
            lng: p.longitude !== undefined ? parseFloat(p.longitude) : parseFloat(p.lng || 0),
            latitude: p.latitude !== undefined ? parseFloat(p.latitude) : parseFloat(p.lat || 0),
            longitude: p.longitude !== undefined ? parseFloat(p.longitude) : parseFloat(p.lng || 0),
            timeSpent: p.time_spent || p.timeSpent || 60,
            rating: parseFloat(p.rating || 4.5),
            reviews: p.reviews !== undefined ? parseInt(p.reviews) : 85,
            opening_hours: p.opening_hours || p.openingHours || '08:00 - 18:00 น.',
            open_days: p.open_days || '0,1,2,3,4,5,6'
        }));
    } catch (e) {
        console.error('getPlaces error:', e);
        return [];
    }
}

function savePlaces(places) {
    localStorage.setItem('kk_places', JSON.stringify(places));
}

function generateId() {
    return 'p_' + Math.random().toString(36).substr(2, 9);
}

// ฟังก์ชันดึงข้อมูลล่าสุดจาก PostgreSQL (Node.js API) แบบ async
async function loadPlaces() {
    try {
        const apiUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:5000/api/places'
            : 'https://testwijai-backend-eo0d.onrender.com/api/places';
        const response = await fetch(apiUrl);
        if (response.ok) {
            const result = await response.json();
            if (result.data && Array.isArray(result.data) && result.data.length > 0) {
                const formatted = result.data.map(p => ({
                    ...p,
                    id: String(p.id),
                    lat: parseFloat(p.latitude !== undefined ? p.latitude : p.lat),
                    lng: parseFloat(p.longitude !== undefined ? p.longitude : p.lng),
                    latitude: parseFloat(p.latitude !== undefined ? p.latitude : p.lat),
                    longitude: parseFloat(p.longitude !== undefined ? p.longitude : p.lng),
                    timeSpent: p.time_spent || p.timeSpent || 60,
                    rating: parseFloat(p.rating || 4.5),
                    reviews: p.reviews !== undefined ? parseInt(p.reviews) : 85,
                    opening_hours: p.opening_hours || '08:00 - 18:00 น.'
                }));
                localStorage.setItem('kk_places', JSON.stringify(formatted));
                window.dispatchEvent(new CustomEvent('placesUpdated', { detail: formatted }));
                return formatted;
            }
        }
    } catch (e) {
        // Backend ยังไม่ได้เปิด ให้ใช้ cached local data ต่อไป
    }
    return getPlaces();
}

// ซิงค์ทันทีเมื่อโหลดไฟล์ data.js
loadPlaces();

// ══════════════════════════════════════════════════════════════
// Opening Hours Parsing & Verification Utilities
// ══════════════════════════════════════════════════════════════

function parseOpeningHours(hoursStr) {
    if (!hoursStr || typeof hoursStr !== 'string') {
        return { is24Hours: true, openMin: 0, closeMin: 1440, closedDays: [], raw: hoursStr || 'เปิด 24 ชั่วโมง' };
    }
    const cleanStr = hoursStr.trim();
    if (cleanStr.includes('24 ชั่วโมง') || cleanStr.toLowerCase().includes('24 hours') || cleanStr.toLowerCase().includes('24 hr')) {
        return { is24Hours: true, openMin: 0, closeMin: 1440, closedDays: [], raw: cleanStr };
    }

    // Check for closed days: e.g. "(ปิดวันอังคาร)", "(ปิดจันทร์-อังคาร)", "(ปิดวันจันทร์)"
    const closedDays = [];
    const dayMap = {
        'อาทิตย์': 0, 'จันทร์': 1, 'อังคาร': 2, 'พุธ': 3, 'พฤหัส': 4, 'พฤหัสบดี': 4, 'ศุกร์': 5, 'เสาร์': 6
    };
    const closedMatch = cleanStr.match(/ปิด\s*(?:วัน)?\s*([ก-๙\-]+)/);
    if (closedMatch) {
        const dayPart = closedMatch[1];
        if (dayPart.includes('-')) {
            const parts = dayPart.split('-');
            const sName = parts[0].replace('วัน', '');
            const eName = parts[1].replace('วัน', '');
            const sIdx = dayMap[sName];
            const eIdx = dayMap[eName];
            if (sIdx !== undefined && eIdx !== undefined) {
                let cur = sIdx;
                while (true) {
                    closedDays.push(cur);
                    if (cur === eIdx) break;
                    cur = (cur + 1) % 7;
                }
            }
        } else {
            const dName = dayPart.replace('วัน', '');
            if (dayMap[dName] !== undefined) {
                closedDays.push(dayMap[dName]);
            }
        }
    }

    // Extract time range: e.g. "08:30 - 16:30 น." or "16:00 - 23:00"
    const timeMatch = cleanStr.match(/(\d{1,2})[:.](\d{2})\s*[-–toถึง]\s*(\d{1,2})[:.](\d{2})/);
    if (timeMatch) {
        const oH = parseInt(timeMatch[1], 10);
        const oM = parseInt(timeMatch[2], 10);
        const cH = parseInt(timeMatch[3], 10);
        const cM = parseInt(timeMatch[4], 10);
        const openMin = oH * 60 + oM;
        let closeMin = cH * 60 + cM;
        const isOvernight = closeMin <= openMin;
        if (isOvernight) {
            closeMin += 1440; // crosses midnight
        }
        return {
            is24Hours: false,
            openMin,
            closeMin,
            isOvernight,
            closedDays,
            raw: cleanStr
        };
    }

    // Default fallback if time pattern not found
    return { is24Hours: false, openMin: 8 * 60, closeMin: 18 * 60, closedDays, raw: cleanStr };
}

function isPlaceOpenAtTime(place, arrivalMin, stayMin = 60, targetDayOfWeek = null) {
    const hours = parseOpeningHours(place.opening_hours || place.openingHours);

    if (targetDayOfWeek === null) {
        targetDayOfWeek = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
    }

    // ตรวจสอบวันเปิดทำการจากคอลัมน์ open_days (0=อาทิตย์, 1=จันทร์, ..., 6=เสาร์)
    if (place.open_days && typeof place.open_days === 'string' && place.open_days.trim() !== '') {
        const openDaysList = place.open_days.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
        if (openDaysList.length < 7 && !openDaysList.includes(targetDayOfWeek)) {
            return { isOpen: false, reason: 'closed_day', hours };
        }
    }

    if (hours.closedDays && hours.closedDays.includes(targetDayOfWeek)) {
        return { isOpen: false, reason: 'closed_day', hours };
    }

    if (hours.is24Hours) return { isOpen: true, hours };

    // Normalized check for overnight or regular hours
    if (!hours.isOvernight) {
        const canVisit = arrivalMin >= hours.openMin && (arrivalMin + Math.min(stayMin, 20)) <= hours.closeMin;
        return {
            isOpen: canVisit,
            tooEarly: arrivalMin < hours.openMin,
            tooLate: (arrivalMin + Math.min(stayMin, 20)) > hours.closeMin,
            hours
        };
    } else {
        let adjArrival = arrivalMin;
        if (adjArrival < hours.openMin && adjArrival < (hours.closeMin - 1440)) {
            adjArrival += 1440;
        }
        const canVisit = adjArrival >= hours.openMin && (adjArrival + Math.min(stayMin, 20)) <= hours.closeMin;
        return {
            isOpen: canVisit,
            tooEarly: adjArrival < hours.openMin,
            tooLate: (adjArrival + Math.min(stayMin, 20)) > hours.closeMin,
            hours
        };
    }
}

function doesPlaceOverlapTripWindow(place, tripStartMin, tripEndMin, targetDayOfWeek = null) {
    if (targetDayOfWeek === null) targetDayOfWeek = new Date().getDay();

    // ตรวจสอบวันเปิดทำการจากคอลัมน์ open_days
    if (place.open_days && typeof place.open_days === 'string' && place.open_days.trim() !== '') {
        const openDaysList = place.open_days.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
        if (openDaysList.length < 7 && !openDaysList.includes(targetDayOfWeek)) {
            return false;
        }
    }

    const hours = parseOpeningHours(place.opening_hours || place.openingHours);
    if (hours.is24Hours) return true;

    if (hours.closedDays && hours.closedDays.includes(targetDayOfWeek)) {
        return false;
    }

    let pOpen = hours.openMin;
    let pClose = hours.closeMin;
    let tStart = tripStartMin;
    let tEnd = tripEndMin;

    if (tEnd <= tStart) tEnd += 1440; // overnight trip

    // An overlap exists if max(tStart, pOpen) < min(tEnd, pClose)
    return Math.max(tStart, pOpen) < Math.min(tEnd, pClose);
}
