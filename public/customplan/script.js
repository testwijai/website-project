let map;
let markers = [];
let routeLines = [];
let routingControl = null;
const segmentColors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E'];
let currentItinerary = [];
let sortableList;
let startCoords = {lat: 16.4322, lng: 102.8236};
let endCoords = null;
let currentRouteCoords = null;
let currentRouteIndices = null;
let userLiveMarker = null;       // GPS marker บนแผนที่
let userLocationWatchId = null;  // watchPosition id
let userIsUsingGPS = false;      // true = ใช้ GPS เป็นจุดเริ่มต้น

// ===== Multi-Day Trip State =====
let tripDays = [];
let activeDayIndex = 0;

// Mobile view switcher logic
window.switchCustomMobileView = function(view) {
    const container = document.querySelector('.planner-container');
    if (!container) return;
    container.classList.remove('view-plan', 'view-map');
    container.classList.add('view-' + view);

    document.querySelectorAll('.mobile-tab-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById('tabBtn' + view.charAt(0).toUpperCase() + view.slice(1));
    if (targetBtn) targetBtn.classList.add('active');

    if (view === 'map' && map) {
        setTimeout(() => map.invalidateSize(), 150);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initUserLocation(); // อ่าน GPS อัตโนมัติตอนเริ่ม เหมือน tripplaner

    // Populate time dropdowns
    const startHourSelect = document.getElementById('start-hour');
    if(startHourSelect) {
        let hourOptions = '';
        for(let h=5; h<=23; h++) {
            let hourStr = String(h).padStart(2, '0');
            hourOptions += `<option value="${hourStr}">${hourStr}</option>`;
        }
        startHourSelect.innerHTML = hourOptions;
        startHourSelect.value = '09';
        
        const syncTimeInputs = () => {
            const sh = document.getElementById('start-hour').value;
            const sm = document.getElementById('start-minute').value;
            document.getElementById('start-time').value = `${sh}:${sm}`;
            // If we have an itinerary, re-render to update times
            if (currentItinerary.length > 0) {
                renderItineraryList();
            }
        };
        
        startHourSelect.addEventListener('change', syncTimeInputs);
        document.getElementById('start-minute').addEventListener('change', syncTimeInputs);
        syncTimeInputs();
    }

    initMultiDayTrip(); // เริ่มต้นระบบวันท่องเที่ยวหลายวัน

    // Initialize Sortable
    const itineraryEl = document.getElementById('itinerary-list');
    if (itineraryEl) {
        sortableList = new Sortable(itineraryEl, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function() {
                updateItineraryOrderFromDOM();
            }
        });
    }

    // ถ้า user พิมพ์ input เอง ให้หยุด GPS override
    const startInput = document.getElementById('start-location');
    if (startInput) {
        startInput.addEventListener('input', function() {
            if (this.value) {
                this.dataset.manuallySet = 'true';
                userIsUsingGPS = false;
            }
        });
    }

    // Autocomplete start location
    const autocompleteList = document.getElementById('autocomplete-list');
    if (startInput) {
        startInput.addEventListener('input', function() {
            handleAutocomplete(this.value, autocompleteList, (place) => {
                startInput.value = place.name;
                startInput.dataset.manuallySet = 'true';
                userIsUsingGPS = false;
                startCoords = { lat: place.lat, lng: place.lng };
                currentRouteCoords = null;
                currentRouteIndices = null;
                updateMap();
                map.setView([place.lat, place.lng], 14);
                if (currentItinerary.length > 0) renderItineraryList();
            });
        });

        startInput.addEventListener('focus', function() {
            handleAutocomplete('', autocompleteList, (place) => {
                startInput.value = place.name;
                startInput.dataset.manuallySet = 'true';
                userIsUsingGPS = false;
                startCoords = { lat: place.lat, lng: place.lng };
                currentRouteCoords = null;
                currentRouteIndices = null;
                updateMap();
                map.setView([place.lat, place.lng], 14);
                if (currentItinerary.length > 0) renderItineraryList();
            });
        });

        startInput.addEventListener('click', function() {
            handleAutocomplete('', autocompleteList, (place) => {
                startInput.value = place.name;
                startInput.dataset.manuallySet = 'true';
                userIsUsingGPS = false;
                startCoords = { lat: place.lat, lng: place.lng };
                currentRouteCoords = null;
                currentRouteIndices = null;
                updateMap();
                map.setView([place.lat, place.lng], 14);
                if (currentItinerary.length > 0) renderItineraryList();
            });
        });
    }

    // Autocomplete end location
    const endInput = document.getElementById('end-location');
    const endAutocompleteList = document.getElementById('end-autocomplete-list');
    if (endInput) {
        endInput.addEventListener('input', function() {
            handleAutocomplete(this.value, endAutocompleteList, (place) => {
                endInput.value = place.name;
                endCoords = { lat: place.lat, lng: place.lng };
                currentRouteCoords = null;
                currentRouteIndices = null;
                updateMap();
                map.setView([place.lat, place.lng], 14);
                if (currentItinerary.length > 0) renderItineraryList();
            });
        });

        endInput.addEventListener('focus', function() {
            handleAutocomplete('', endAutocompleteList, (place) => {
                endInput.value = place.name;
                endCoords = { lat: place.lat, lng: place.lng };
                currentRouteCoords = null;
                currentRouteIndices = null;
                updateMap();
                map.setView([place.lat, place.lng], 14);
                if (currentItinerary.length > 0) renderItineraryList();
            });
        });

        endInput.addEventListener('click', function() {
            handleAutocomplete('', endAutocompleteList, (place) => {
                endInput.value = place.name;
                endCoords = { lat: place.lat, lng: place.lng };
                currentRouteCoords = null;
                currentRouteIndices = null;
                updateMap();
                map.setView([place.lat, place.lng], 14);
                if (currentItinerary.length > 0) renderItineraryList();
            });
        });
    }

    document.addEventListener('click', function(e) {
        if (startInput && autocompleteList && !startInput.contains(e.target) && !autocompleteList.contains(e.target)) {
            autocompleteList.style.display = 'none';
        }
        if (endInput && endAutocompleteList && !endInput.contains(e.target) && !endAutocompleteList.contains(e.target)) {
            endAutocompleteList.style.display = 'none';
        }
    });

    // Add place modal search
    const modalSearchInput = document.getElementById('modal-search');
    if (modalSearchInput) {
        modalSearchInput.addEventListener('input', function(e) {
            renderAvailablePlaces(e.target.value);
        });
    }

    initMapCategoryFilters();
    initModalCategoryFilters();

    // โหลดข้อมูลล่าสุดจาก PostgreSQL API
    if (typeof loadPlaces === 'function') {
        loadPlaces().then(() => {
            renderAvailablePlaces();
            renderAllPlacesOnMap();
        });
    }
    window.addEventListener('placesUpdated', () => {
        renderAvailablePlaces();
        renderAllPlacesOnMap();
    });
});

function handleAutocomplete(val, listEl, onSelect) {
    if (!listEl) return;
    listEl.innerHTML = '';
    const allPlaces = typeof getPlaces === 'function' ? getPlaces() : [];
    const trimmed = (val || '').trim().toLowerCase();
    const matches = (trimmed && !trimmed.startsWith('📍'))
        ? allPlaces.filter(p => (p.name && p.name.toLowerCase().includes(trimmed)) || (p.category && p.category.toLowerCase().includes(trimmed)))
        : allPlaces;
    
    if (matches.length > 0) {
        listEl.style.display = 'block';
        matches.forEach(place => {
            const div = document.createElement('div');
            div.innerHTML = `<i class="fa-solid fa-location-dot" style="color: var(--primary-color); margin-right: 0.5rem; flex-shrink: 0;"></i><span style="font-weight: 500;">${place.name}</span> <span style="font-size:0.8rem; color:var(--text-muted); margin-left:0.4rem; white-space: nowrap;">(${place.category || 'สถานที่'})</span>`;
            div.addEventListener('mousedown', (e) => {
                e.preventDefault();
            });
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                onSelect(place);
                listEl.style.display = 'none';
            });
            listEl.appendChild(div);
        });
    } else {
        listEl.style.display = 'block';
        const emptyDiv = document.createElement('div');
        emptyDiv.style.color = 'var(--text-muted)';
        emptyDiv.style.cursor = 'default';
        emptyDiv.style.justifyContent = 'center';
        emptyDiv.textContent = 'ไม่พบสถานที่ที่ตรงกัน';
        listEl.appendChild(emptyDiv);
    }
}

window.clearEndLocation = function() {
    document.getElementById('end-location').value = '';
    endCoords = null;
    currentRouteCoords = null;
    currentRouteIndices = null;
    updateMap();
    if (currentItinerary.length > 0) renderItineraryList();
};

window.useStartLocationAsEnd = function() {
    const startInput = document.getElementById('start-location');
    const endInput = document.getElementById('end-location');
    if (startInput.value && startCoords) {
        endInput.value = startInput.value;
        endCoords = { lat: startCoords.lat, lng: startCoords.lng };
        currentRouteCoords = null;
        currentRouteIndices = null;
        updateMap();
        if (currentItinerary.length > 0) renderItineraryList();
    } else {
        alert("กรุณาระบุจุดเริ่มต้นก่อนครับ");
    }
};

// Helper: Escape HTML string
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Category icon helper
function getCategoryIcon(cat) {
    if (!cat) return 'fa-solid fa-map-pin';
    if (cat.includes('วัด') || cat.includes('ศักดิ์สิทธิ์')) return 'fa-solid fa-vihara';
    if (cat.includes('คาเฟ่') || cat.includes('กาแฟ')) return 'fa-solid fa-mug-saucer';
    if (cat.includes('อาหาร') || cat.includes('กิน')) return 'fa-solid fa-utensils';
    if (cat.includes('ธรรมชาติ') || cat.includes('น้ำตก') || cat.includes('อุทยาน')) return 'fa-solid fa-tree';
    if (cat.includes('สวนสัตว์')) return 'fa-solid fa-paw';
    if (cat.includes('ตลาด') || cat.includes('ช้อปปิ้ง')) return 'fa-solid fa-bag-shopping';
    if (cat.includes('พิพิธภัณฑ์') || cat.includes('ประวัติศาสตร์')) return 'fa-solid fa-landmark';
    return 'fa-solid fa-location-dot';
}

// Category color class helper
function getCategoryClass(cat) {
    if (!cat) return '';
    if (cat.includes('วัด') || cat.includes('ศักดิ์สิทธิ์')) return 'cat-temple';
    if (cat.includes('คาเฟ่')) return 'cat-cafe';
    if (cat.includes('อาหาร')) return 'cat-food';
    if (cat.includes('ธรรมชาติ')) return 'cat-nature';
    if (cat.includes('ตลาด')) return 'cat-market';
    if (cat.includes('พิพิธภัณฑ์')) return 'cat-museum';
    return '';
}

// Create rich popup card HTML
function createPlacePopupHTML(place, isInItinerary = false, stopNumber = null) {
    const id = escapeHtml(String(place.id));
    const name = escapeHtml(place.name || 'สถานที่ท่องเที่ยว');
    const category = escapeHtml(place.category || 'ทั่วไป');
    const catIcon = getCategoryIcon(place.category);
    const image = escapeHtml(place.image || 'https://images.unsplash.com/photo-1590766940554-638092019c00?auto=format&fit=crop&w=400&q=80');
    const rating = place.rating ? Number(place.rating).toFixed(1) : '4.5';
    const reviews = '';
    const hours = escapeHtml(place.opening_hours || '08:00 - 18:00 น.');
    const desc = escapeHtml(place.description || 'สถานที่ท่องเที่ยวยอดนิยมในจังหวัดขอนแก่น');

    const actionArea = isInItinerary
        ? `
            <div class="in-plan-box">
                <div class="in-plan-badge">
                    <i class="fa-solid fa-circle-check"></i> อยู่ในแผนแล้ว (จุดที่ ${stopNumber || ''})
                </div>
                <button type="button" class="btn-popup-remove" onclick="window.removePlaceFromMapPopup('${id}')">
                    <i class="fa-solid fa-trash-can"></i> นำออกจากแผน
                </button>
            </div>
          `
        : `
            <button type="button" class="btn-popup-add" onclick="window.addPlaceFromMapPopup('${id}')">
                <i class="fa-solid fa-plus"></i> เพิ่มสถานที่ไปยังแผน
            </button>
          `;

    return `
        <div class="place-popup-card">
            <div class="place-popup-img-wrapper">
                <img class="place-popup-img" src="${image}" alt="${name}" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1590766940554-638092019c00?auto=format&fit=crop&w=400&q=80';">
                <div class="place-popup-cat-badge">
                    <i class="${catIcon}"></i> ${category}
                </div>
            </div>
            <div class="place-popup-body">
                <div class="place-popup-title">${name}</div>
                <div class="place-popup-meta">
                    <span class="place-popup-rating"><i class="fa-solid fa-star"></i> ${rating}</span>
                    <span class="place-popup-hours"><i class="fa-regular fa-clock"></i> ${hours}</span>
                </div>
                <div class="place-popup-desc">${desc}</div>
                ${actionArea}
            </div>
        </div>
    `;
}

// Popup Actions
window.addPlaceFromMapPopup = function(id) {
    if (map) map.closePopup();
    if (typeof window.addPlaceToItinerary === 'function') {
        window.addPlaceToItinerary(id);
    }
};

window.removePlaceFromMapPopup = function(id) {
    if (map) map.closePopup();
    if (typeof removePlace === 'function') {
        removePlace(id);
    }
};

// Tourist Places Map Layer State & Controls
let showAllPlacesOnMap = true;
let allPlacesLayer = null;
let selectedMapCategories = new Set(); // empty or 'ทั้งหมด' means all

function toggleAllPlacesOnMap() {
    showAllPlacesOnMap = !showAllPlacesOnMap;
    const btn = document.getElementById('togglePlacesLayerBtn');
    if (btn) {
        if (showAllPlacesOnMap) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    }
    renderAllPlacesOnMap();
}
window.toggleAllPlacesOnMap = toggleAllPlacesOnMap;

function renderAllPlacesOnMap() {
    if (!map) return;
    if (!allPlacesLayer) {
        allPlacesLayer = L.layerGroup().addTo(map);
    }
    allPlacesLayer.clearLayers();
    if (!showAllPlacesOnMap) return;

    const allPlaces = typeof getPlaces === 'function' ? getPlaces() : [];
    const itineraryIds = new Set(currentItinerary.map(p => String(p.id)));

    allPlaces.forEach(place => {
        // ข้ามสถานที่ที่อยู่ในแผนแล้ว เพราะมีหมุดลำดับที่ (1, 2, 3...) อยู่แล้ว
        if (itineraryIds.has(String(place.id))) return;

        // กรองตามหมวดหมู่สถานที่ที่เลือกบนแผนที่ (รองรับการเลือกหลายหมวดหมู่)
        if (selectedMapCategories.size > 0 && !selectedMapCategories.has('ทั้งหมด')) {
            if (!selectedMapCategories.has(place.category)) return;
        }

        const lat = place.lat !== undefined ? place.lat : place.latitude;
        const lng = place.lng !== undefined ? place.lng : place.longitude;
        if (!lat || !lng) return;

        const catIcon = getCategoryIcon(place.category);
        const catClass = getCategoryClass(place.category);

        const imgUrl = place.image || 'https://images.unsplash.com/photo-1590766940554-638092019c00?auto=format&fit=crop&w=400&q=80';
        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'place-marker-container',
                html: `
                    <div class="place-marker place-marker-selectable" title="${escapeHtml(place.name)}">
                        <div class="place-marker-img" style="background-image: url('${imgUrl}')"></div>
                    </div>
                `,
                iconSize: [44, 44],
                iconAnchor: [22, 22],
                popupAnchor: [0, -22]
            })
        });

        marker.bindPopup(createPlacePopupHTML(place, false), {
            className: 'custom-place-popup',
            maxWidth: 290,
            closeButton: true
        });

        allPlacesLayer.addLayer(marker);
    });
}

function initMapCategoryFilters() {
    const btns = document.querySelectorAll('.map-cat-btn');
    const allBtn = document.querySelector('.map-cat-btn[data-cat="ทั้งหมด"]');

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.dataset.cat;
            if (cat === 'ทั้งหมด') {
                selectedMapCategories.clear();
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            } else {
                if (allBtn) allBtn.classList.remove('active');
                selectedMapCategories.delete('ทั้งหมด');

                if (selectedMapCategories.has(cat)) {
                    selectedMapCategories.delete(cat);
                    btn.classList.remove('active');
                } else {
                    selectedMapCategories.add(cat);
                    btn.classList.add('active');
                }

                // ถ้าไม่ได้เลือกหมวดใดเลย ให้กลับไปเลือก "ทั้งหมด" อัตโนมัติ
                if (selectedMapCategories.size === 0) {
                    if (allBtn) allBtn.classList.add('active');
                }
            }
            
            updateMapFilterBadge();

            // หากปิด layer ไว้อยู่ ให้เปิดอัตโนมัติเพื่อให้เห็นหมุด
            if (!showAllPlacesOnMap) {
                showAllPlacesOnMap = true;
                const toggleBtn = document.getElementById('togglePlacesLayerBtn');
                if (toggleBtn) toggleBtn.classList.add('active');
            }
            renderAllPlacesOnMap();
        });
    });

    // ปิดเมนูตัวกรองเมื่อคลิกพื้นที่อื่นภายนอก
    document.addEventListener('click', function(e) {
        const group = document.getElementById('mapControlsGroup');
        const dropdown = document.getElementById('mapCategoryDropdown');
        const toggleBtn = document.getElementById('mapFilterToggleBtn');
        if (group && !group.contains(e.target) && dropdown && dropdown.style.display !== 'none') {
            dropdown.style.display = 'none';
            if (toggleBtn) toggleBtn.classList.remove('open');
        }
    });
}

window.toggleMapFilterDropdown = function() {
    const dropdown = document.getElementById('mapCategoryDropdown');
    const toggleBtn = document.getElementById('mapFilterToggleBtn');
    if (!dropdown) return;
    const isHidden = dropdown.style.display === 'none' || !dropdown.style.display;
    if (isHidden) {
        dropdown.style.display = 'block';
        if (toggleBtn) toggleBtn.classList.add('open');
    } else {
        dropdown.style.display = 'none';
        if (toggleBtn) toggleBtn.classList.remove('open');
    }
};

window.resetMapCategories = function() {
    selectedMapCategories.clear();
    const btns = document.querySelectorAll('.map-cat-btn');
    const allBtn = document.querySelector('.map-cat-btn[data-cat="ทั้งหมด"]');
    btns.forEach(b => b.classList.remove('active'));
    if (allBtn) allBtn.classList.add('active');
    updateMapFilterBadge();
    renderAllPlacesOnMap();
};

function updateMapFilterBadge() {
    const badge = document.getElementById('mapFilterBadge');
    const toggleBtn = document.getElementById('mapFilterToggleBtn');
    const count = (selectedMapCategories.size > 0 && !selectedMapCategories.has('ทั้งหมด'))
        ? selectedMapCategories.size
        : 0;
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
    if (toggleBtn) {
        toggleBtn.classList.toggle('has-filter', count > 0);
    }
}

// อัปเดตหมุดสถานที่ท่องเที่ยวอัตโนมัติเมื่อข้อมูล places มีการอัปเดต
window.addEventListener('placesUpdated', () => {
    renderAllPlacesOnMap();
});

function initMap() {
    map = L.map('map', {
        rotate: true,
        touchRotate: true,
        bearing: 0
    }).setView([16.4322, 102.8236], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    allPlacesLayer = L.layerGroup().addTo(map);
    renderAllPlacesOnMap();

    // ฟัง zoom event เพื่อปรับขนาดหมุดอัตโนมัติตามระดับการซูม
    map.on('zoomend zoom', updateMapZoomClass);
    updateMapZoomClass();
}

function updateMapZoomClass() {
    if (!map) return;
    const z = map.getZoom();
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    mapEl.classList.remove('zoom-extreme', 'zoom-far', 'zoom-mid', 'zoom-close');
    if (z <= 10) {
        mapEl.classList.add('zoom-extreme');
    } else if (z <= 12) {
        mapEl.classList.add('zoom-far');
    } else if (z === 13) {
        mapEl.classList.add('zoom-mid');
    } else {
        mapEl.classList.add('zoom-close');
    }
}

// Alias เพื่อให้ TripNavigator เรียก switchMobileView ได้เหมือนสคริปต์ tripplaner
window.switchMobileView = function(view) {
    switchCustomMobileView(view);
};

/**
 * \u0e2d\u0e48\u0e32\u0e19 GPS \u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34\u0e15\u0e2d\u0e19\u0e42\u0e2b\u0e25\u0e14\u0e2b\u0e19\u0e49\u0e32 \u0e41\u0e25\u0e30 watch \u0e15\u0e48\u0e2d\u0e40\u0e19\u0e37\u0e48\u0e2d\u0e07 (\u0e40\u0e2b\u0e21\u0e37\u0e2d\u0e19 tripplaner)
 */
let lastKnownGPS = null;

function initUserLocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            lastKnownGPS = { lat, lng };

            startCoords = { lat, lng };
            userIsUsingGPS = true;

            const inputEl = document.getElementById('start-location');
            if (inputEl && !inputEl.dataset.manuallySet) {
                inputEl.value = `📍 ตำแหน่งปัจจุบัน (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            }

            placeUserGPSMarker(lat, lng);
            map.setView([lat, lng], 14);
        },
        (err) => { console.warn('GPS initial error:', err.message); },
        { enableHighAccuracy: false, timeout: 8000 }
    );

    if (userLocationWatchId !== null) {
        navigator.geolocation.clearWatch(userLocationWatchId);
    }
    userLocationWatchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            lastKnownGPS = { lat, lng };

            if (userIsUsingGPS) {
                startCoords = { lat, lng };
                const inputEl = document.getElementById('start-location');
                if (inputEl && !inputEl.dataset.manuallySet) {
                    inputEl.value = `📍 ตำแหน่งปัจจุบัน (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                }
                placeUserGPSMarker(lat, lng);
            }
        },
        (err) => { console.warn('GPS watch error:', err.message); },
        { enableHighAccuracy: false, maximumAge: 10000, timeout: 20000 }
    );
}

/**
 * \u0e27\u0e32\u0e07 marker GPS (pulsing dot) \u0e1a\u0e19\u0e41\u0e1c\u0e19\u0e17\u0e35\u0e48
 */
function placeUserGPSMarker(lat, lng) {
    if (!map || typeof L === 'undefined') return;

    if (!userLiveMarker) {
        const gpsIcon = L.divIcon({
            className: 'user-gps-marker',
            html: '<div class="user-gps-pulse"></div><div class="user-gps-dot"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        userLiveMarker = L.marker([lat, lng], {
            icon: gpsIcon,
            zIndexOffset: 1000,
            interactive: true
        }).addTo(map).bindPopup('<b>\ud83d\udccd \u0e08\u0e38\u0e14\u0e40\u0e23\u0e34\u0e48\u0e21\u0e15\u0e49\u0e19\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13</b><br><small>\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07 GPS \u0e1b\u0e31\u0e08\u0e08\u0e38\u0e1a\u0e31\u0e19</small>');
    } else {
        userLiveMarker.setLatLng([lat, lng]);
    }
}


function useCurrentLocation() {
    const inputEl = document.getElementById('start-location');
    if (inputEl) {
        inputEl.value = 'กำลังดึงตำแหน่ง...';
        delete inputEl.dataset.manuallySet;
    }
    userIsUsingGPS = true;

    function fallbackIP(cb, errCb) {
        if (typeof GEOAPIFY_API_KEY !== 'undefined' && GEOAPIFY_API_KEY) {
            fetch(`https://api.geoapify.com/v1/ipinfo?apiKey=${GEOAPIFY_API_KEY}`, { signal: AbortSignal.timeout(6000) })
                .then(r => r.json())
                .then(d => {
                    if (d.location?.latitude && d.location?.longitude) {
                        cb(d.location.latitude, d.location.longitude);
                    } else {
                        errCb();
                    }
                })
                .catch(() => errCb());
        } else {
            errCb();
        }
    }

    function getLoc(cb, errCb) {
        if (!navigator.geolocation) {
            fallbackIP(cb, errCb);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => cb(pos.coords.latitude, pos.coords.longitude),
            () => {
                navigator.geolocation.getCurrentPosition(
                    (pos2) => cb(pos2.coords.latitude, pos2.coords.longitude),
                    () => fallbackIP(cb, errCb),
                    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
                );
            },
            { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
        );
    }

    getLoc(
        (lat, lng) => {
            if (inputEl) {
                inputEl.value = `📍 ตำแหน่งปัจจุบัน (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            }
            startCoords = { lat: lat, lng: lng };
            currentRouteCoords = null;
            currentRouteIndices = null;
            placeUserGPSMarker(lat, lng);
            updateMap();
            if (map) map.flyTo([lat, lng], 14);
            if (currentItinerary.length > 0) renderItineraryList();
        },
        () => {
            alert('ไม่สามารถดึงตำแหน่งปัจจุบันได้ กรุณาอนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์ หรือเลือกจากรายการ');
            if (inputEl) inputEl.value = '';
        }
    );
}

// Custom Route Calculation
window.calculateCustomRoute = function() {
    if (currentItinerary.length === 0) {
        alert('กรุณาเพิ่มสถานที่ในแผนก่อนคำนวณเส้นทาง');
        return;
    }
    
    document.getElementById('trip-summary').style.display = 'none';
    
    // Clear route coords before new calculation
    currentRouteCoords = null;
    currentRouteIndices = null;
    
    updateScheduleWithRealTimes(true).then(() => {
        updateMap();
    }).catch(err => {
        console.error("Schedule error:", err);
        renderItineraryList();
        updateMap();
    });
};

function updateItineraryOrderFromDOM() {
    const listItems = document.querySelectorAll('.itinerary-item');
    const newOrder = [];
    listItems.forEach(item => {
        const id = String(item.dataset.id);
        const place = currentItinerary.find(p => String(p.id) === id);
        if (place) newOrder.push(place);
    });
    currentItinerary = newOrder;
    if (typeof tripDays !== 'undefined' && tripDays[activeDayIndex]) {
        tripDays[activeDayIndex].itinerary = currentItinerary;
    }
    // Remove computed real times as order changed
    currentItinerary.forEach(p => p.realTravelMins = undefined);
    currentRouteCoords = null;
    currentRouteIndices = null;
    renderItineraryList();
    updateMap();
}

function removePlace(id) {
    const targetId = String(id);
    currentItinerary = currentItinerary.filter(p => String(p.id) !== targetId);
    if (typeof tripDays !== 'undefined' && tripDays[activeDayIndex]) {
        tripDays[activeDayIndex].itinerary = currentItinerary;
        if (typeof renderDayTabs === 'function') renderDayTabs();
    }
    currentRouteCoords = null;
    currentRouteIndices = null;
    if (currentItinerary.length === 0) {
        document.getElementById('itinerary-list').innerHTML = `
            <div id="empty-state" style="text-align: center; color: #6B7280; padding: 2rem 0; font-size: 0.95rem;">
                ยังไม่มีสถานที่ในแผน<br>คลิก "เพิ่มสถานที่" เพื่อเริ่มวางแผน
            </div>`;
        document.getElementById('trip-summary').style.display = 'none';
    } else {
        renderItineraryList();
    }
    updateMap();
}
window.removePlace = removePlace;

function renderItineraryList() {
    const list = document.getElementById('itinerary-list');
    if (!list) return;
    
    if (currentItinerary.length === 0) return;
    
    list.innerHTML = '';
    
    let startTimeStr = document.getElementById('start-time').value || '09:00';
    let [hours, minutes] = startTimeStr.split(':').map(Number);
    if (isNaN(hours)) hours = 9;
    if (isNaN(minutes)) minutes = 0;
    
    let prevLoc = startCoords;
    const mode = document.getElementById('transport-mode').value;
    
    let allWaypointsForList = [...currentItinerary];
    if (endCoords) {
        allWaypointsForList.push({
            id: 'end_point',
            name: document.getElementById('end-location').value || 'จุดสิ้นสุดการเดินทาง',
            lat: endCoords.lat,
            lng: endCoords.lng,
            timeSpent: 0,
            isEndLocation: true,
            category: 'จุดสิ้นสุด'
        });
    }

    allWaypointsForList.forEach((place, index) => {
        const timeToSpend = place.timeSpent !== undefined ? place.timeSpent : 60;
        
        let travelMins = 0;
        if (index === 0 && !startCoords) {
            travelMins = 0;
        } else if (place.realTravelMins !== undefined) {
            travelMins = place.realTravelMins;
        } else if (prevLoc) {
            travelMins = getTravelTime(prevLoc, place, mode);
        }
        
        if (isNaN(travelMins)) travelMins = 15;
        minutes += travelMins;
        hours += Math.floor(minutes / 60);
        minutes %= 60;
        
        const currentStartTime = formatTime(hours, minutes);
        
        minutes += timeToSpend;
        hours += Math.floor(minutes / 60);
        minutes %= 60;
        
        place.startTime = currentStartTime;
        place.endTime = formatTime(hours, minutes);
        
        prevLoc = place;
        
        const item = document.createElement('div');
        item.className = 'itinerary-item';
        item.dataset.id = place.id;
        
        if (place.isEndLocation) {
            item.innerHTML = `
                <div class="item-time" style="color:#1E3A8A;">${place.startTime}</div>
                <div class="item-details">
                    <h4 style="color:#1E3A8A;"><i class="fa-solid fa-flag-checkered"></i> ${place.name}</h4>
                    <p style="color:#6B7280; font-size:0.8rem;">จบการเดินทาง</p>
                </div>
            `;
            item.style.cursor = 'default';
        } else {
            item.innerHTML = `
                <div class="item-time">${place.startTime}</div>
                <div class="item-details">
                    <h4>${place.name}</h4>
                    <p style="display: flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-hourglass-half"></i> 
                        <input type="number" value="${place.timeSpent}" min="5" step="5" style="width: 60px; padding: 2px 5px; border-radius: 4px; border: 1px solid #ccc;" onchange="updatePlaceTime('${place.id}', this.value)"> นาที
                    </p>
                    <p>
                        <span style="margin-right: 10px;"><i class="fa-solid fa-tag"></i> ${place.category}</span>
                    </p>
                </div>
                <div class="item-actions">
                    <i class="fa-solid fa-xmark action-icon" onclick="removePlace('${place.id}')"></i>
                </div>
            `;
        }
        list.appendChild(item);
    });
    
    updateSummary();
}

window.updatePlaceTime = function(id, newTime) {
    const time = parseInt(newTime);
    if (isNaN(time) || time < 5) return;
    const targetId = String(id);
    const place = currentItinerary.find(p => String(p.id) === targetId);
    if (place) {
        place.timeSpent = time;
        currentRouteCoords = null;
        currentRouteIndices = null;
        renderItineraryList();
    }
};

function formatTime(h, m) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function updateSummary() {
    const startNavBtn = document.getElementById('start-nav-btn');
    if (currentItinerary.length === 0) {
        document.getElementById('trip-summary').style.display = 'none';
        if (startNavBtn) startNavBtn.style.display = 'none';
        return;
    }
    // \u0e41\u0e2a\u0e14\u0e07\u0e1b\u0e38\u0e48\u0e21 nav \u0e17\u0e31\u0e19\u0e17\u0e35\u0e17\u0e35\u0e48\u0e21\u0e35\u0e2a\u0e16\u0e32\u0e19\u0e17\u0e35\u0e48 (\u0e44\u0e21\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e23\u0e2d\u0e04\u0e33\u0e19\u0e27\u0e13)
    if (startNavBtn) startNavBtn.style.display = 'inline-flex';
    // summary stats \u0e41\u0e2a\u0e14\u0e07\u0e40\u0e1f\u0e1e\u0e32\u0e30\u0e40\u0e21\u0e37\u0e48\u0e2d\u0e04\u0e33\u0e19\u0e27\u0e19\u0e41\u0e25\u0e49\u0e27
    if (!currentRouteCoords) {
        document.getElementById('trip-summary').style.display = 'none';
        return;
    }
    document.getElementById('trip-summary').style.display = 'flex';

    
    let totalMins = 0;
    let totalDistKm = 0;
    
    let prevLoc = startCoords;
    const mode = document.getElementById('transport-mode').value;
    
    let allWaypoints = [...currentItinerary];
    if (endCoords) {
        allWaypoints.push({lat: endCoords.lat, lng: endCoords.lng, timeSpent: 0});
    }

    allWaypoints.forEach(place => {
        if (prevLoc) {
            if (place.realTravelMins !== undefined) {
                totalMins += place.realTravelMins;
                totalDistKm += (place.realDistKm || 0);
            } else {
                totalMins += getTravelTime(prevLoc, place, mode);
                totalDistKm += estimateDistanceKm(prevLoc, place);
            }
        }
        totalMins += (place.timeSpent || 0);
        prevLoc = place;
    });
    
    const h = Math.floor(totalMins / 60);
    const m = Math.floor(totalMins % 60);
    document.getElementById('summary-time').innerText = h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`;
    document.getElementById('summary-distance').innerText = `${totalDistKm.toFixed(1)} กม.`;
}

// Distance estimation fallback
function estimateDistanceKm(p1, p2) {
    const R = 6371;
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLng = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * 
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c * 1.3; // multiply by 1.3 to roughly estimate road distance vs straight line
}

function getTravelTime(p1, p2, mode) {
    const distKm = estimateDistanceKm(p1, p2);
    let speedKmH = mode === 'motorcycle' ? 40 : 50;
    if (distKm > 15) speedKmH += 20; // faster outside city
    return Math.ceil((distKm / speedKmH) * 60);
}

let selectedModalCategories = new Set(); // empty or 'ทั้งหมด' means all

// Add Place Modal logic
window.openAddPlaceModal = function() {
    const searchInput = document.getElementById('modal-search');
    if (searchInput) searchInput.value = '';
    selectedModalCategories.clear();
    document.querySelectorAll('.modal-cat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === 'ทั้งหมด');
    });
    document.getElementById('addPlaceModal').style.display = 'block';
    renderAvailablePlaces();
};

window.closeAddPlaceModal = function() {
    document.getElementById('addPlaceModal').style.display = 'none';
};

window.onclick = function(event) {
    const modal = document.getElementById('addPlaceModal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
};

function renderAvailablePlaces(searchQuery = '') {
    const list = document.getElementById('available-places');
    list.innerHTML = '';
    
    let allPlaces = typeof getPlaces === 'function' ? getPlaces() : [];
    
    // กรองตามหมวดหมู่สถานที่ใน Modal (รองรับการเลือกหลายหมวดหมู่)
    if (selectedModalCategories.size > 0 && !selectedModalCategories.has('ทั้งหมด')) {
        allPlaces = allPlaces.filter(p => selectedModalCategories.has(p.category));
    }

    if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        allPlaces = allPlaces.filter(p => (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
    }
    
    // Filter out places already in itinerary (เปรียบเทียบแบบ String ป้องกัน Type mismatch)
    const addedIds = currentItinerary.map(p => String(p.id));
    allPlaces = allPlaces.filter(p => !addedIds.includes(String(p.id)));
    
    if (allPlaces.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">ไม่พบสถานที่ในหมวดหมู่นี้</div>';
        return;
    }

    // Show top 50 to not overwhelm
    allPlaces.slice(0, 50).forEach(place => {
        const div = document.createElement('div');
        div.className = 'add-place-item';
        const placeIdStr = String(place.id);
        const isOpen = typeof isPlaceOpenOnTripDay === 'function' ? isPlaceOpenOnTripDay(place) : true;
        const closedBadge = !isOpen ? '<span style="background:#FEF2F2; color:#DC2626; border:1px solid #FECACA; padding:2px 6px; border-radius:10px; font-size:0.75rem; font-weight:600; margin-left:6px;"><i class="fa-solid fa-circle-exclamation"></i> ปิดวันนี้</span>' : '';

        div.innerHTML = `
            <div>
                <h4>${place.name}</h4>
                <p style="font-size:0.8rem; color:var(--text-muted);"><i class="fa-solid fa-tag"></i> ${place.category} | <i class="fa-solid fa-star" style="color:#F59E0B"></i> ${place.rating || '4.5'}${closedBadge}</p>
            </div>
            <button class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="addPlaceToItinerary('${placeIdStr}')"><i class="fa-solid fa-plus"></i></button>
        `;
        list.appendChild(div);
    });
}

function initModalCategoryFilters() {
    const btns = document.querySelectorAll('.modal-cat-btn');
    const allBtn = document.querySelector('.modal-cat-btn[data-cat="ทั้งหมด"]');

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.dataset.cat;
            if (cat === 'ทั้งหมด') {
                selectedModalCategories.clear();
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            } else {
                if (allBtn) allBtn.classList.remove('active');
                selectedModalCategories.delete('ทั้งหมด');

                if (selectedModalCategories.has(cat)) {
                    selectedModalCategories.delete(cat);
                    btn.classList.remove('active');
                } else {
                    selectedModalCategories.add(cat);
                    btn.classList.add('active');
                }

                if (selectedModalCategories.size === 0) {
                    if (allBtn) allBtn.classList.add('active');
                }
            }

            const searchInput = document.getElementById('modal-search');
            renderAvailablePlaces(searchInput ? searchInput.value : '');
        });
    });
}

window.addPlaceToItinerary = function(id) {
    const allPlaces = getPlaces();
    const targetId = String(id);
    const place = allPlaces.find(p => String(p.id) === targetId);
    if (place) {
        const placeClone = {...place, id: String(place.id)};
        if(!placeClone.timeSpent) placeClone.timeSpent = 60; // default
        currentItinerary.push(placeClone);
        if (typeof tripDays !== 'undefined' && tripDays[activeDayIndex]) {
            tripDays[activeDayIndex].itinerary = currentItinerary;
            if (typeof renderDayTabs === 'function') renderDayTabs();
        }
        
        currentRouteCoords = null;
        currentRouteIndices = null;
        
        closeAddPlaceModal();
        renderItineraryList();
        updateMap();
    }
};

// Map and Routing logic
function updateMap() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    routeLines.forEach(l => map.removeLayer(l));
    routeLines = [];
    if (routingControl) map.removeControl(routingControl);
    
    const latlngs = [];
    
    if (startCoords) {
        const startLatLng = [startCoords.lat, startCoords.lng];
        latlngs.push(startLatLng);
        // ไม่วาง start marker อีกต่อไป เพราะมี GPS pulsing dot (userLiveMarker) ทำหน้าที่แทนแล้ว
    }

    if (currentItinerary.length > 0) {
        currentItinerary.forEach((place, index) => {
            const latlng = [place.lat, place.lng];
            latlngs.push(latlng);
            
            const marker = L.marker(latlng, {
                icon: L.divIcon({
                    className: 'place-marker-container',
                    html: `
                        <div class="place-marker">
                            <div class="place-marker-img" style="background-image: url('${place.image || 'https://via.placeholder.com/150'}')"></div>
                            <div class="place-marker-num">${index + 1}</div>
                        </div>
                    `,
                    iconSize: [44, 44],
                    iconAnchor: [22, 22],
                    popupAnchor: [0, -22]
                })
            }).addTo(map).bindPopup(createPlacePopupHTML(place, true, index + 1), {
                className: 'custom-place-popup',
                maxWidth: 290,
                closeButton: true
            });
            markers.push(marker);
        });
    }
    
    if (endCoords) {
        const endLatLng = [endCoords.lat, endCoords.lng];
        latlngs.push(endLatLng);
        
        const isSameAsStart = startCoords && (Math.abs(startCoords.lat - endCoords.lat) < 0.0001 && Math.abs(startCoords.lng - endCoords.lng) < 0.0001);
        if (!isSameAsStart) {
            const endMarker = L.marker(endLatLng, {
                icon: L.divIcon({
                    className: 'place-marker-container',
                    html: `
                        <div class="end-marker-pin">
                            <i class="fa-solid fa-flag-checkered"></i>
                        </div>
                    `,
                    iconSize: [40, 40],
                    iconAnchor: [20, 40]
                })
            }).addTo(map).bindPopup(`<b>จุดสิ้นสุด</b>`);
            markers.push(endMarker);
        }
    }
    
    // Draw route if we calculated it
    if (currentRouteCoords && currentRouteIndices && currentRouteIndices.length > 0) {
        for (let i = 0; i < currentRouteIndices.length - 1; i++) {
            const startIdx = currentRouteIndices[i];
            const endIdx = currentRouteIndices[i + 1];
            const segmentCoords = currentRouteCoords.slice(startIdx, endIdx + 1).map(c => [c.lat, c.lng]);
            
            const color = segmentColors[i % segmentColors.length];
            
            const segmentLine = L.polyline(segmentCoords, {
                color: color,
                weight: 6,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);
            routeLines.push(segmentLine);
        }
    }
    
    if (latlngs.length > 0) {
        const bounds = L.latLngBounds(latlngs);
        map.fitBounds(bounds, { padding: [50, 50] });
    }

    renderAllPlacesOnMap();
}

// Geoapify & OSRM Real Travel Time Fetcher
const GEOAPIFY_API_KEY = '66ebddfc6486404f8155f26ad646927d';

async function fetchGeoapifyRoute(waypoints, mode) {
    if (!GEOAPIFY_API_KEY || !waypoints || waypoints.length < 2) return null;
    const gMode = (mode === 'motorcycle') ? 'motorcycle' : 'drive';
    const wpString = waypoints.map(wp => `${wp.lat},${wp.lng}`).join('|');
    const url = `https://api.geoapify.com/v1/routing?waypoints=${wpString}&mode=${gMode}&format=geojson&apiKey=${GEOAPIFY_API_KEY}`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) return null;
        const data = await res.json();
        const feat = data.features?.[0];
        if (!feat || !feat.properties?.legs) return null;

        const geomCoords = feat.geometry.type === 'MultiLineString'
            ? feat.geometry.coordinates.flat(1)
            : feat.geometry.coordinates;

        const coords = geomCoords.map(c => ({ lat: c[1], lng: c[0] }));

        const indices = [0];
        for (let i = 1; i < waypoints.length - 1; i++) {
            const wp = waypoints[i];
            let closestIdx = indices[i - 1];
            let minDist = Infinity;
            for (let j = indices[i - 1]; j < coords.length; j++) {
                const c = coords[j];
                const d = (c.lat - wp.lat) ** 2 + (c.lng - wp.lng) ** 2;
                if (d < minDist) { minDist = d; closestIdx = j; }
            }
            indices.push(closestIdx);
        }
        indices.push(coords.length - 1);

        const legs = feat.properties.legs;
        let times = legs.map(leg => Math.round(leg.time / 60));
        if (mode === 'motorcycle') times = times.map(t => Math.max(1, Math.round(t * 0.8)));
        times = times.map(t => t + (mode === 'motorcycle' ? 2 : 5));
        return { times, coords, indices };
    } catch (e) {
        console.warn('Geoapify route fetch failed, falling back to OSRM:', e.message);
        return null;
    }
}

// ใช้ OSRM API หลายตัวสำรอง เพื่อความเสถียร
const OSRM_SERVERS = [
    { base: 'https://router.project-osrm.org', prefix: '' },
    { base: 'https://routing.openstreetmap.de', prefix: '/routed-car' }
];
let osrmServerIdx = 0;

async function fetchOSRM(path, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        const srv = OSRM_SERVERS[osrmServerIdx % OSRM_SERVERS.length];
        const fullUrl = srv.base + srv.prefix + path;
        try {
            const response = await fetch(fullUrl, { signal: AbortSignal.timeout(12000) });
            if (response.ok) return response;
            if (response.status === 429) {
                console.warn('OSRM Rate limit, switching server...');
                osrmServerIdx++;
                await new Promise(r => setTimeout(r, 800));
                continue;
            }
            if (response.status === 400) return null;
        } catch (err) {
            console.warn(`OSRM server ${srv.base} failed:`, err.message);
            osrmServerIdx++;
            if (attempt < retries) await new Promise(r => setTimeout(r, 500));
        }
    }
    return null;
}

async function getRealTravelTimes(waypoints, mode, useRadiuses = false) {
    if (waypoints.length < 2) return null;

    // First try Geoapify for real vehicular driving route
    if (!useRadiuses) {
        const geoapifyRes = await fetchGeoapifyRoute(waypoints, mode);
        if (geoapifyRes) return geoapifyRes;
    }

    const profile = 'driving';
    const coordString = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
    const waypointIndices = waypoints.map((_, i) => i).join(';');

    let url = `/route/v1/${profile}/${coordString}?overview=full&geometries=geojson&steps=false&waypoints=${waypointIndices}`;
    if (useRadiuses) {
        const radiusesString = waypoints.map(() => '10000').join(';');
        url += `&radiuses=${radiusesString}`;
    }

    try {
        const response = await fetchOSRM(url);
        if (!response) {
            if (!useRadiuses) return getRealTravelTimes(waypoints, mode, true);
            return null;
        }

        const data = await response.json();

        if (data.code === 'Ok') {
            let coords = null;
            let indices = null;

            if (data.routes[0].geometry && data.routes[0].geometry.coordinates) {
                coords = data.routes[0].geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));

                indices = [0];
                for (let i = 1; i < waypoints.length - 1; i++) {
                    const wp = waypoints[i];
                    let closestIdx = indices[i - 1];
                    let minDist = Infinity;
                    for (let j = indices[i - 1]; j < coords.length; j++) {
                        const c = coords[j];
                        const d = (c.lat - wp.lat) ** 2 + (c.lng - wp.lng) ** 2;
                        if (d < minDist) { minDist = d; closestIdx = j; }
                    }
                    indices.push(closestIdx);
                }
                indices.push(coords.length - 1);
            }

            const legs = data.routes[0].legs;
            let times = legs.map(leg => Math.round(leg.duration / 60));
            if (mode === 'motorcycle') times = times.map(t => Math.max(1, Math.round(t * 0.8)));
            times = times.map(t => t + (mode === 'motorcycle' ? 2 : 5));
            return { times, coords, indices, legs };
        } else if (data.code === 'NoRoute' && !useRadiuses) {
            return getRealTravelTimes(waypoints, mode, true);
        }
    } catch (err) {
        console.error('OSRM fetch error:', err);
    }
    return null;
}

// True Route Calculation using OSRM
async function updateScheduleWithRealTimes(renderRoute = true) {
    if (!startCoords || currentItinerary.length === 0) {
        renderItineraryList();
        return;
    }
    
    const waypoints = [];
    waypoints.push(startCoords);
    currentItinerary.forEach(p => waypoints.push(p));
    
    if (endCoords) {
        waypoints.push(endCoords);
    }
    
    const mode = document.getElementById('transport-mode').value || 'car';
    const result = await getRealTravelTimes(waypoints, mode);
    
    if (result && result.times && result.times.length > 0) {
        if (renderRoute && result.coords && result.indices) {
            currentRouteCoords = result.coords;
            currentRouteIndices = result.indices;
        }
        
        currentItinerary.forEach((p, i) => {
            p.realTravelMins = result.times[i] || 15;
            if (result.legs && result.legs[i]) {
                p.realDistKm = result.legs[i].distance / 1000;
            }
        });
    } else {
        // Fallback
        let prev = startCoords;
        currentItinerary.forEach(p => {
            p.realTravelMins = getTravelTime(prev, p, mode);
            prev = p;
        });
        if (renderRoute) {
            currentRouteCoords = null;
            currentRouteIndices = null;
        }
    }
    
    renderItineraryList();
    updateMap(); // \u0e27\u0e32\u0e14\u0e40\u0e2a\u0e49\u0e19\u0e17\u0e32\u0e07\u0e1a\u0e19\u0e41\u0e1c\u0e19\u0e17\u0e35\u0e48\u0e2b\u0e25\u0e31\u0e07\u0e44\u0e14\u0e49\u0e23\u0e39\u0e15 coords
    updateSummary(); // \u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15\u0e2a\u0e23\u0e38\u0e1b\u0e41\u0e25\u0e30\u0e1b\u0e38\u0e48\u0e21 nav
}

// Start Trip Navigation (auto-calculates route if not done yet)
window.startTripNavigation = async function() {
    if (!currentItinerary || currentItinerary.length === 0) {
        alert('\u0e01\u0e23\u0e38\u0e13\u0e32\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e2a\u0e16\u0e32\u0e19\u0e17\u0e35\u0e48\u0e01\u0e48\u0e2d\u0e19\u0e40\u0e23\u0e34\u0e48\u0e21\u0e15\u0e49\u0e19\u0e01\u0e32\u0e23\u0e40\u0e14\u0e34\u0e19\u0e17\u0e32\u0e07');
        return;
    }

    // \u0e16\u0e49\u0e32\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e04\u0e33\u0e19\u0e27\u0e13\u0e40\u0e2a\u0e49\u0e19\u0e17\u0e32\u0e07 \u2192 \u0e04\u0e33\u0e19\u0e27\u0e13\u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34\u0e01\u0e48\u0e2d\u0e19
    if (!currentRouteCoords) {
        const btn = document.getElementById('start-nav-btn');
        const origHTML = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> \u0e01\u0e33\u0e25\u0e31\u0e07\u0e04\u0e33\u0e19\u0e27\u0e13...';
        }
        try {
            await updateScheduleWithRealTimes(true);
        } catch (e) {
            console.warn('Route calc error:', e);
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHTML;
        }
    }

    if (typeof TripNavigator !== 'undefined') {
        let totalDistKm = 0;
        if (typeof routeLines !== 'undefined' && routeLines.length > 0) {
            routeLines.forEach(line => {
                const pts = line.getLatLngs ? line.getLatLngs().flat() : [];
                for (let i = 1; i < pts.length; i++) {
                    totalDistKm += pts[i-1].distanceTo(pts[i]) / 1000;
                }
            });
        }
        TripNavigator.start({
            itinerary: currentItinerary,
            startCoords: startCoords,
            endCoords: endCoords,
            map: map,
            totalDistance: totalDistKm,
            endName: document.getElementById('end-location') ? document.getElementById('end-location').value : '\u0e08\u0e38\u0e14\u0e2a\u0e34\u0e49\u0e19\u0e2a\u0e38\u0e14'
        });
    } else {
        alert('ระบบนำทางยังไม่พร้อมใช้งาน กรุณารีเฟรชหน้าเว็บ');
    }
};

// ============================================================
// ===== MULTI-DAY TRIP SYSTEM (Custom Plan) =====
// ============================================================

const DAY_NAMES_TH = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์'];
const MAX_TRIP_DAYS = 7;

function toLocalDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getDayNameFromDateStr(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return '';
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return DAY_NAMES_TH[d.getDay()];
}

function getDayOfWeekFromDateStr(dateStr) {
    if (!dateStr) return new Date().getDay();
    const parts = dateStr.split('-');
    if (parts.length !== 3) return new Date().getDay();
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.getDay();
}

function isPlaceOpenOnTripDay(place) {
    const openDays = place.open_days || '0,1,2,3,4,5,6';
    if (!openDays || openDays.trim() === '') return true;
    const openDaysList = openDays.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
    if (openDaysList.length >= 7) return true;
    const day = tripDays && tripDays[activeDayIndex] ? tripDays[activeDayIndex] : null;
    const dow = day && day.date ? getDayOfWeekFromDateStr(day.date) : new Date().getDay();
    return openDaysList.includes(dow);
}

function initMultiDayTrip() {
    const todayStr = toLocalDateString(new Date());
    tripDays = [{
        date: todayStr,
        startTime: '09:00',
        startLocation: document.getElementById('start-location')?.value || '',
        endLocation: document.getElementById('end-location')?.value || '',
        itinerary: []
    }];
    activeDayIndex = 0;
    renderDayTabs();
    syncDayFormToUI();
}

function saveCurrentDayState() {
    if (!tripDays || !tripDays[activeDayIndex]) return;
    const day = tripDays[activeDayIndex];
    day.date = document.getElementById('trip-date')?.value || day.date;
    day.startTime = document.getElementById('start-time')?.value || '09:00';
    day.startLocation = document.getElementById('start-location')?.value || '';
    day.endLocation = document.getElementById('end-location')?.value || '';
    day.startCoords = startCoords ? {...startCoords} : null;
    day.endCoords = endCoords ? {...endCoords} : null;
    day.itinerary = currentItinerary ? [...currentItinerary] : [];
    day.currentRouteCoords = currentRouteCoords;
    day.currentRouteIndices = currentRouteIndices;
}

function restoreDayState(index) {
    const day = tripDays[index];
    if (!day) return;

    if (day.itinerary && day.itinerary.length > 0) {
        currentItinerary = [...day.itinerary];
        currentRouteCoords = day.currentRouteCoords || null;
        currentRouteIndices = day.currentRouteIndices || null;
        renderItineraryList();
        updateMap();
    } else {
        currentItinerary = [];
        currentRouteCoords = null;
        currentRouteIndices = null;
        const list = document.getElementById('itinerary-list');
        if (list) {
            list.innerHTML = `
                <div id="empty-state" style="text-align: center; color: #6B7280; padding: 2rem 0; font-size: 0.95rem;">
                    ยังไม่มีสถานที่ในแผนวันที่ ${index + 1}<br>คลิก "เพิ่มสถานที่" เพื่อเริ่มวางแผน
                </div>`;
            const summary = document.getElementById('trip-summary');
            if (summary) summary.style.display = 'none';
        }
        updateMap();
    }
}

window.addTripDay = function() {
    if (tripDays.length >= MAX_TRIP_DAYS) return;
    saveCurrentDayState();
    const lastDay = tripDays[tripDays.length - 1];
    const lastDate = new Date(lastDay.date + 'T00:00:00');
    lastDate.setDate(lastDate.getDate() + 1);

    const newDay = {
        date: toLocalDateString(lastDate),
        startTime: lastDay.startTime || '09:00',
        startLocation: lastDay.startLocation || '',
        endLocation: lastDay.endLocation || '',
        startCoords: lastDay.startCoords ? {...lastDay.startCoords} : (startCoords ? {...startCoords} : null),
        endCoords: lastDay.endCoords ? {...lastDay.endCoords} : (endCoords ? {...endCoords} : null),
        itinerary: []
    };

    tripDays.push(newDay);
    activeDayIndex = tripDays.length - 1;
    renderDayTabs();
    syncDayFormToUI();
    restoreDayState(activeDayIndex);
};

window.removeTripDay = function() {
    if (tripDays.length <= 1) return;
    tripDays.pop();
    if (activeDayIndex >= tripDays.length) activeDayIndex = tripDays.length - 1;
    renderDayTabs();
    syncDayFormToUI();
    restoreDayState(activeDayIndex);
};

window.switchActiveDay = function(index) {
    if (index < 0 || index >= tripDays.length) return;
    if (index === activeDayIndex) return;
    saveCurrentDayState();
    activeDayIndex = index;
    renderDayTabs();
    syncDayFormToUI();
    restoreDayState(index);
};

function syncDayFormToUI() {
    const day = tripDays[activeDayIndex];
    if (!day) return;

    const dateInput = document.getElementById('trip-date');
    if (dateInput && day.date) {
        dateInput.value = day.date;
        updateDayNameDisplay(day.date);
    }

    const labelEl = document.getElementById('activeDayLabel');
    if (labelEl) labelEl.textContent = `วันที่ ${activeDayIndex + 1}`;

    if (day.startTime) {
        const [sh, sm] = day.startTime.split(':');
        const startHourEl = document.getElementById('start-hour');
        const startMinEl = document.getElementById('start-minute');
        if (startHourEl) startHourEl.value = sh;
        if (startMinEl) startMinEl.value = sm || '00';
    }

    const stEl = document.getElementById('start-time');
    if (stEl && day.startTime) stEl.value = day.startTime;

    if (day.startLocation !== undefined && document.getElementById('start-location')) {
        document.getElementById('start-location').value = day.startLocation;
    }
    if (day.endLocation !== undefined && document.getElementById('end-location')) {
        document.getElementById('end-location').value = day.endLocation;
    }
    if (day.startCoords) {
        startCoords = {...day.startCoords};
    }
    if (day.endCoords !== undefined) {
        endCoords = day.endCoords ? {...day.endCoords} : null;
    }

    const dayCountLabel = document.getElementById('dayCountLabel');
    if (dayCountLabel) dayCountLabel.textContent = `${tripDays.length} วัน`;
    const removeDayBtn = document.getElementById('removeDayBtn');
    if (removeDayBtn) removeDayBtn.disabled = tripDays.length <= 1;
    const addDayBtn = document.getElementById('addDayBtn');
    if (addDayBtn) addDayBtn.disabled = tripDays.length >= MAX_TRIP_DAYS;
}

function renderDayTabs() {
    const container = document.getElementById('dayTabsContainer');
    if (!container) return;
    container.innerHTML = '';
    tripDays.forEach((day, i) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'day-tab-pill' + (i === activeDayIndex ? ' active' : '');
        const dayName = getDayNameFromDateStr(day.date);
        const dateParts = day.date.split('-');
        const displayDate = dateParts.length === 3 ? `${parseInt(dateParts[2])}/${parseInt(dateParts[1])}` : day.date;
        const hasPlaces = day.itinerary && day.itinerary.length > 0;
        const planBadge = hasPlaces ? '<span style="width:6px; height:6px; border-radius:50%; background:#10B981; display:inline-block; margin-left:4px;" title="มีสถานที่แล้ว"></span>' : '';

        pill.innerHTML = `<i class="fa-solid fa-calendar-day"></i> วัน ${i + 1} <span style="opacity:0.85;font-weight:400;">(${dayName} ${displayDate})</span>${planBadge}`;
        pill.onclick = () => window.switchActiveDay(i);
        container.appendChild(pill);
    });
}

function updateDayNameDisplay(dateStr) {
    const el = document.getElementById('trip-date-day-name');
    if (!el || !dateStr) return;
    const dayName = getDayNameFromDateStr(dateStr);
    el.innerHTML = dayName ? `<i class="fa-solid fa-circle-dot"></i> วัน${dayName}` : '';
}

window.onTripDateChange = function(newDateStr) {
    if (tripDays[activeDayIndex]) tripDays[activeDayIndex].date = newDateStr;
    updateDayNameDisplay(newDateStr);
    renderDayTabs();
};
