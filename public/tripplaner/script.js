let map;
let markers = [];
let routeLines = []; // keep track of colored segments
let routingControl = null;
const segmentColors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E'];
let routeLine = null;
let currentItinerary = [];
let sortableList;
let startCoords = {lat: 16.4322, lng: 102.8236};
let endCoords = null;
let lastRouteBounds = null; // เก็บ bounds ล่าสุดสำหรับ fit บน mobile

// ===== Multi-Day Trip State =====
let tripDays = []; // Array of { date: 'YYYY-MM-DD', startTime: '09:00', endTime: '18:00', plan: [] }
let activeDayIndex = 0; // วันที่กำลังแสดงอยู่

// Realtime user location
let userLocationWatchId = null;
let userLiveMarker = null;     // Leaflet marker แสดงตำแหน่ง GPS
let userIsUsingGPS = false;    // true = ใช้ตำแหน่งปัจจุบัน

// Mobile view switcher logic
window.switchMobileView = function(view) {
    const container = document.querySelector('.planner-container');
    if (!container) return;
    container.classList.remove('view-form', 'view-map', 'view-result');
    container.classList.add('view-' + view);

    document.querySelectorAll('.mobile-tab-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById('tabBtn' + view.charAt(0).toUpperCase() + view.slice(1));
    if (targetBtn) targetBtn.classList.add('active');

    if (view === 'map' && map) {
        // รอให้ DOM แสดง map ก่อนแล้วค่อย resize และ fit bounds (เฉพาะตอนไม่ได้กำลังนำทาง)
        setTimeout(() => {
            map.invalidateSize();
            const isNavigating = typeof TripNavigator !== 'undefined' && TripNavigator.getState && TripNavigator.getState().isActive;
            if (!isNavigating && lastRouteBounds && lastRouteBounds.isValid()) {
                map.fitBounds(lastRouteBounds, { padding: [60, 60], animate: true });
            }
        }, 200);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initUserLocation(); // Auto-detect GPS เมื่อโหลดหน้า
    initDistrictSelector(); // เริ่มต้นตัวเลือกอำเภอ

    // Populate time dropdowns (24h format)
    const startHourSelect = document.getElementById('start-hour');
    const endHourSelect = document.getElementById('end-hour');
    if(startHourSelect && endHourSelect) {
        let hourOptions = '';
        for(let h=5; h<=23; h++) {
            let hourStr = String(h).padStart(2, '0');
            hourOptions += `<option value="${hourStr}">${hourStr}</option>`;
        }
        startHourSelect.innerHTML = hourOptions;
        endHourSelect.innerHTML = hourOptions;
        startHourSelect.value = '09';
        endHourSelect.value = '18';
        
        const syncTimeInputs = () => {
            const sh = document.getElementById('start-hour').value;
            const sm = document.getElementById('start-minute').value;
            const eh = document.getElementById('end-hour').value;
            const em = document.getElementById('end-minute').value;
            document.getElementById('start-time').value = `${sh}:${sm}`;
            document.getElementById('end-time').value = `${eh}:${em}`;
        };
        
        document.getElementById('start-hour').addEventListener('change', syncTimeInputs);
        document.getElementById('start-minute').addEventListener('change', syncTimeInputs);
        document.getElementById('end-hour').addEventListener('change', syncTimeInputs);
        document.getElementById('end-minute').addEventListener('change', syncTimeInputs);
        
        syncTimeInputs();
    }

    initMultiDayTrip(); // เริ่มต้นระบบวันท่องเที่ยวหลายวัน (หลังจากโหลด time options)

    document.getElementById('trip-form').addEventListener('submit', function(e) {
        e.preventDefault();
        generatePlan();
    });

    // Initialize Sortable for drag-and-drop
    const itineraryEl = document.getElementById('itinerary-list');
    if (itineraryEl) {
        sortableList = new Sortable(itineraryEl, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function() {
                // Reorder array based on DOM
                updateItineraryOrderFromDOM();
            }
        });
    }

    // Autocomplete logic
    const startInput = document.getElementById('start-location');
    const autocompleteList = document.getElementById('autocomplete-list');

    function renderStartAutocomplete(val = '') {
        if (!autocompleteList) return;
        autocompleteList.innerHTML = '';
        const allPlaces = typeof getPlaces === 'function' ? getPlaces() : [];
        const query = (val || '').trim().toLowerCase();

        // If query is empty or starts with GPS indicator, show all places
        const matches = (query && !query.startsWith('📍'))
            ? allPlaces.filter(p => (p.name && p.name.toLowerCase().includes(query)) || (p.category && p.category.toLowerCase().includes(query)))
            : allPlaces;

        if (matches.length > 0) {
            autocompleteList.style.display = 'block';
            matches.forEach(place => {
                const div = document.createElement('div');
                div.innerHTML = `<i class="fa-solid fa-location-dot" style="color: var(--primary-color); margin-right: 0.5rem; flex-shrink: 0;"></i><span style="font-weight: 500;">${place.name}</span> <span style="font-size:0.8rem; color:var(--text-muted); margin-left:0.4rem; white-space: nowrap;">(${place.category || 'สถานที่'})</span>`;
                div.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                });
                div.addEventListener('click', function(e) {
                    e.stopPropagation();
                    startInput.value = place.name;
                    startInput.dataset.manuallySet = '1'; // mark manual
                    startCoords = { lat: place.lat, lng: place.lng };
                    userIsUsingGPS = false;
                    if (userLiveMarker && map) map.removeLayer(userLiveMarker);
                    userLiveMarker = null;
                    autocompleteList.style.display = 'none';
                    updateMap();
                    map.setView([place.lat, place.lng], 14);
                });
                autocompleteList.appendChild(div);
            });
        } else {
            autocompleteList.style.display = 'block';
            const emptyDiv = document.createElement('div');
            emptyDiv.style.color = 'var(--text-muted)';
            emptyDiv.style.cursor = 'default';
            emptyDiv.style.justifyContent = 'center';
            emptyDiv.textContent = 'ไม่พบสถานที่ที่ตรงกัน';
            autocompleteList.appendChild(emptyDiv);
        }
    }

    if (startInput) {
        startInput.addEventListener('input', function() {
            const val = this.value;
            if (val) {
                this.dataset.manuallySet = '1';
                if (userIsUsingGPS) {
                    userIsUsingGPS = false;
                    if (userLiveMarker && map) map.removeLayer(userLiveMarker);
                    userLiveMarker = null;
                }
            } else {
                delete this.dataset.manuallySet;
            }
            renderStartAutocomplete(val);
        });

        // เมื่อคลิกหรือ focus ให้แสดงรายชื่อสถานที่ทั้งหมดทันทีโดยไม่ต้องพิมพ์
        startInput.addEventListener('focus', function() {
            renderStartAutocomplete('');
        });

        startInput.addEventListener('click', function() {
            renderStartAutocomplete('');
        });
    }

    // End Location Autocomplete
    const endInput = document.getElementById('end-location');
    const endAutocompleteList = document.getElementById('end-autocomplete-list');

    function renderEndAutocomplete(val = '') {
        if (!endAutocompleteList) return;
        endAutocompleteList.innerHTML = '';
        const allPlaces = typeof getPlaces === 'function' ? getPlaces() : [];
        const query = (val || '').trim().toLowerCase();

        const matches = query
            ? allPlaces.filter(p => (p.name && p.name.toLowerCase().includes(query)) || (p.category && p.category.toLowerCase().includes(query)))
            : allPlaces;

        if (matches.length > 0) {
            endAutocompleteList.style.display = 'block';
            matches.forEach(place => {
                const div = document.createElement('div');
                div.innerHTML = `<i class="fa-solid fa-location-dot" style="color: var(--primary-color); margin-right: 0.5rem; flex-shrink: 0;"></i><span style="font-weight: 500;">${place.name}</span> <span style="font-size:0.8rem; color:var(--text-muted); margin-left:0.4rem; white-space: nowrap;">(${place.category || 'สถานที่'})</span>`;
                div.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                });
                div.addEventListener('click', function(e) {
                    e.stopPropagation();
                    endInput.value = place.name;
                    endCoords = { lat: place.lat, lng: place.lng };
                    endAutocompleteList.style.display = 'none';
                    updateMap();
                    map.setView([place.lat, place.lng], 14);
                });
                endAutocompleteList.appendChild(div);
            });
        } else {
            endAutocompleteList.style.display = 'block';
            const emptyDiv = document.createElement('div');
            emptyDiv.style.color = 'var(--text-muted)';
            emptyDiv.style.cursor = 'default';
            emptyDiv.style.justifyContent = 'center';
            emptyDiv.textContent = 'ไม่พบสถานที่ที่ตรงกัน';
            endAutocompleteList.appendChild(emptyDiv);
        }
    }

    if (endInput) {
        endInput.addEventListener('input', function() {
            if (!this.value) {
                endCoords = null;
            }
            renderEndAutocomplete(this.value);
        });

        // เมื่อคลิกหรือ focus ให้แสดงรายชื่อสถานที่ทั้งหมดทันทีโดยไม่ต้องพิมพ์
        endInput.addEventListener('focus', function() {
            renderEndAutocomplete('');
        });

        endInput.addEventListener('click', function() {
            renderEndAutocomplete('');
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

    // Travel distance range slider listener
    const travelDistInput = document.getElementById('travel-distance');
    const travelDistVal = document.getElementById('travel-distance-val');

    function updateTravelDistanceUI(shouldFitBounds = false) {
        if (!travelDistInput || !travelDistVal) return;
        const val = parseInt(travelDistInput.value);
        if (val >= 50) {
            travelDistVal.textContent = 'ไม่จำกัด';
        } else {
            travelDistVal.textContent = `${val} กม.`;
            // เมื่อเลือกใช้งานระบบรัศมี (< 50 กม.) ให้ล้าง/รีเซ็ตระบบอำเภอเป็น "ทุกอำเภอ"
            if (typeof isAllDistricts !== 'undefined' && !isAllDistricts && typeof resetDistrictsToAll === 'function') {
                resetDistrictsToAll();
            }
        }
        updateRadiusCircle(shouldFitBounds);
    }

    if (travelDistInput) {
        travelDistInput.addEventListener('input', function() {
            updateTravelDistanceUI(false);
        });
        travelDistInput.addEventListener('change', function() {
            updateTravelDistanceUI(true);
        });
        setTimeout(() => updateTravelDistanceUI(false), 300);
    }
});

let radiusCircleLayer = null;

function updateRadiusCircle(shouldFitBounds = false) {
    if (!map || typeof L === 'undefined') return;
    const distInput = document.getElementById('travel-distance');
    if (!distInput) return;
    const val = parseInt(distInput.value);

    // If unlimited (>= 50) or custom polygon drawn, or no startCoords, remove layer
    if (val >= 50 || selectedPolygon || !startCoords) {
        if (radiusCircleLayer) {
            map.removeLayer(radiusCircleLayer);
            radiusCircleLayer = null;
        }
        return;
    }

    const radiusMeters = val * 1000;
    const center = [startCoords.lat, startCoords.lng];

    if (radiusCircleLayer && map.hasLayer(radiusCircleLayer)) {
        radiusCircleLayer.setLatLng(center);
        radiusCircleLayer.setRadius(radiusMeters);
        if (radiusCircleLayer.getTooltip()) {
            radiusCircleLayer.setTooltipContent(`📍 รัศมี ${val} กม.`);
        }
    } else {
        if (radiusCircleLayer) {
            map.removeLayer(radiusCircleLayer);
        }
        radiusCircleLayer = L.circle(center, {
            radius: radiusMeters,
            color: '#E05A47',
            fillColor: '#E05A47',
            fillOpacity: 0.16,
            weight: 2.5,
            dashArray: '8, 6'
        }).addTo(map);

        radiusCircleLayer.bindTooltip(`📍 รัศมี ${val} กม.`, {
            permanent: true,
            direction: 'top',
            className: 'radius-tooltip'
        }).openTooltip();
    }

    radiusCircleLayer.bringToBack();

    if (shouldFitBounds && radiusCircleLayer && map) {
        map.fitBounds(radiusCircleLayer.getBounds(), { padding: [50, 50], maxZoom: 14 });
    }
}

window.clearEndLocation = function() {
    document.getElementById('end-location').value = '';
    endCoords = null;
    updateMap();
};

window.useStartLocationAsEnd = function() {
    const startInput = document.getElementById('start-location');
    const endInput = document.getElementById('end-location');
    
    if (startInput.value && startCoords) {
        endInput.value = startInput.value;
        endCoords = { lat: startCoords.lat, lng: startCoords.lng };
        updateMap();
    } else {
        alert("กรุณาระบุจุดเริ่มต้นก่อนครับ");
    }
};

// ===== District (Amphoe) State & Polygon Management =====
let districtBaseLayer = null;
let districtPolygonLayer = null;
let isAllDistricts = true;
let selectedDistrictNames = new Set();

function isPointInGeoJSONRing(lat, lng, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        // GeoJSON coordinates are [lng, lat]
        const xi = ring[i][1], yi = ring[i][0];
        const xj = ring[j][1], yj = ring[j][0];
        const intersect = ((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function isPointInDistrictFeature(lat, lng, feature) {
    if (!feature || !feature.geometry) return false;
    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
        if (isPointInGeoJSONRing(lat, lng, geom.coordinates[0])) {
            for (let h = 1; h < geom.coordinates.length; h++) {
                if (isPointInGeoJSONRing(lat, lng, geom.coordinates[h])) return false;
            }
            return true;
        }
        return false;
    } else if (geom.type === 'MultiPolygon') {
        for (let p = 0; p < geom.coordinates.length; p++) {
            const poly = geom.coordinates[p];
            if (isPointInGeoJSONRing(lat, lng, poly[0])) {
                let inHole = false;
                for (let h = 1; h < poly.length; h++) {
                    if (isPointInGeoJSONRing(lat, lng, poly[h])) {
                        inHole = true;
                        break;
                    }
                }
                if (!inHole) return true;
            }
        }
        return false;
    }
    return false;
}

function isPointInSelectedDistricts(lat, lng) {
    if (isAllDistricts || selectedDistrictNames.size === 0) {
        return true;
    }
    if (!window.KHONKAEN_DISTRICTS_GEOJSON || !window.KHONKAEN_DISTRICTS_GEOJSON.features) {
        return true;
    }
    const features = window.KHONKAEN_DISTRICTS_GEOJSON.features;
    for (let i = 0; i < features.length; i++) {
        const f = features[i];
        if (selectedDistrictNames.has(f.properties.amp_th)) {
            if (isPointInDistrictFeature(lat, lng, f)) {
                return true;
            }
        }
    }
    return false;
}

function initDistrictBaseMap() {
    if (!map || !window.KHONKAEN_DISTRICTS_GEOJSON) return;
    if (districtBaseLayer) return;

    districtBaseLayer = L.geoJSON(window.KHONKAEN_DISTRICTS_GEOJSON, {
        interactive: false,
        style: function () {
            return {
                color: '#94A3B8',
                weight: 1,
                opacity: 0.45,
                fillColor: '#94A3B8',
                fillOpacity: 0.02
            };
        }
    }).addTo(map);
}

function updateDistrictPolygons() {
    if (!map) return;
    if (!districtPolygonLayer) {
        districtPolygonLayer = L.featureGroup().addTo(map);
    }
    districtPolygonLayer.clearLayers();

    if (!window.KHONKAEN_DISTRICTS_GEOJSON || !window.KHONKAEN_DISTRICTS_GEOJSON.features) return;
    const features = window.KHONKAEN_DISTRICTS_GEOJSON.features;

    if (isAllDistricts || selectedDistrictNames.size === 0) {
        return;
    }

    const selectedFeatures = features.filter(f => selectedDistrictNames.has(f.properties.amp_th));
    if (selectedFeatures.length === 0) return;

    const geoLayer = L.geoJSON({
        type: 'FeatureCollection',
        features: selectedFeatures
    }, {
        interactive: false,
        style: function () {
            return {
                color: '#BA5D3E',
                weight: 2.5,
                opacity: 0.95,
                fillColor: '#BA5D3E',
                fillOpacity: 0.20,
                dashArray: '5, 5'
            };
        }
    });

    districtPolygonLayer.addLayer(geoLayer);

    try {
        const bounds = geoLayer.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13, animate: true });
        }
    } catch (e) {
        console.error('Fit district bounds error:', e);
    }
}

function toggleDistrictSelection(name) {
    if (isAllDistricts) {
        isAllDistricts = false;
        selectedDistrictNames = new Set([name]);
    } else {
        if (selectedDistrictNames.has(name)) {
            selectedDistrictNames.delete(name);
            if (selectedDistrictNames.size === 0) {
                isAllDistricts = true;
            }
        } else {
            selectedDistrictNames.add(name);
            const total = (window.KHONKAEN_DISTRICTS_GEOJSON && window.KHONKAEN_DISTRICTS_GEOJSON.features)
                ? window.KHONKAEN_DISTRICTS_GEOJSON.features.length
                : 26;
            if (selectedDistrictNames.size >= total) {
                isAllDistricts = true;
                selectedDistrictNames.clear();
            }
        }
    }

    // เมื่อเลือกใช้อำเภอเฉพาะ ให้ล้าง/รีเซ็ตรัศมีเป็น "ไม่จำกัด" และลบ Buffer ออกจากแผนที่
    if (!isAllDistricts && selectedDistrictNames.size > 0) {
        resetRadiusToUnlimited();
    }

    syncDistrictUI();
    updateDistrictPolygons();
}

function resetRadiusToUnlimited() {
    const travelDistInput = document.getElementById('travel-distance');
    const travelDistVal = document.getElementById('travel-distance-val');
    if (travelDistInput) {
        travelDistInput.value = 50;
        if (travelDistVal) {
            travelDistVal.textContent = 'ไม่จำกัด';
        }
        updateRadiusCircle(false);
    }
}

function resetDistrictsToAll() {
    isAllDistricts = true;
    selectedDistrictNames.clear();
    syncDistrictUI();
    updateDistrictPolygons();
}

function selectAllDistricts() {
    resetDistrictsToAll();
}

function clearAllDistricts() {
    resetDistrictsToAll();
}

function syncDistrictUI() {
    const checkAll = document.getElementById('checkAllDistricts');
    const allOption = document.querySelector('.all-districts-option');
    if (checkAll) checkAll.checked = isAllDistricts;
    if (allOption) allOption.classList.toggle('selected', isAllDistricts);

    const checkboxes = document.querySelectorAll('.district-checkbox');
    checkboxes.forEach(cb => {
        const checked = isAllDistricts || selectedDistrictNames.has(cb.value);
        cb.checked = checked;
        const item = cb.closest('.district-option-item');
        if (item) {
            item.classList.toggle('selected', !isAllDistricts && selectedDistrictNames.has(cb.value));
        }
    });

    const badge = document.getElementById('district-count-badge');
    const btnText = document.getElementById('districtBtnText');

    if (isAllDistricts || selectedDistrictNames.size === 0) {
        if (badge) {
            badge.textContent = 'ทุกอำเภอ (26)';
            badge.className = 'district-badge-all';
        }
        if (btnText) {
            btnText.innerHTML = '<i class="fa-solid fa-earth-asia" style="color: var(--primary-color); margin-right: 6px;"></i>ทุกอำเภอ (ทั้งจังหวัดขอนแก่น)';
        }
    } else {
        const count = selectedDistrictNames.size;
        const names = Array.from(selectedDistrictNames);
        if (badge) {
            badge.textContent = `${count} อำเภอ`;
            badge.className = 'district-badge-selected';
        }
        if (btnText) {
            if (count === 1) {
                btnText.innerHTML = `<i class="fa-solid fa-location-dot" style="color: var(--primary-color); margin-right: 6px;"></i>อำเภอ${names[0]}`;
            } else if (count === 2) {
                btnText.innerHTML = `<i class="fa-solid fa-location-dot" style="color: var(--primary-color); margin-right: 6px;"></i>อ.${names[0]}, อ.${names[1]}`;
            } else {
                btnText.innerHTML = `<i class="fa-solid fa-location-dot" style="color: var(--primary-color); margin-right: 6px;"></i>อ.${names[0]}, อ.${names[1]} (+${count - 2})`;
            }
        }
    }
}

function renderDistrictOptions() {
    const listEl = document.getElementById('districtOptionsList');
    if (!listEl) return;

    if (!window.KHONKAEN_DISTRICTS_GEOJSON || !window.KHONKAEN_DISTRICTS_GEOJSON.features) {
        listEl.innerHTML = '<div style="padding: 1rem; color: #64748B; text-align: center;">กำลังโหลดข้อมูลอำเภอ...</div>';
        return;
    }

    const features = window.KHONKAEN_DISTRICTS_GEOJSON.features;
    const sortedDistricts = features.map(f => f.properties.amp_th).sort((a, b) => a.localeCompare(b, 'th'));

    let html = `
        <label class="district-option-item all-districts-option ${isAllDistricts ? 'selected' : ''}">
            <input type="checkbox" id="checkAllDistricts" ${isAllDistricts ? 'checked' : ''}>
            <span class="district-name"><strong>ทุกอำเภอ (ทั้งจังหวัดขอนแก่น)</strong></span>
            <span class="district-tag">${sortedDistricts.length} อำเภอ</span>
        </label>
        <div style="height: 1px; background: #E2E8F0; margin: 4px 0;"></div>
    `;

    sortedDistricts.forEach(dName => {
        const isSelected = !isAllDistricts && selectedDistrictNames.has(dName);
        html += `
            <label class="district-option-item ${isSelected ? 'selected' : ''}" data-name="${dName}">
                <input type="checkbox" class="district-checkbox" value="${dName}" ${isAllDistricts || isSelected ? 'checked' : ''}>
                <span class="district-name">อำเภอ${dName}</span>
            </label>
        `;
    });

    listEl.innerHTML = html;

    // Attach checkbox events
    const checkAll = document.getElementById('checkAllDistricts');
    if (checkAll) {
        checkAll.addEventListener('change', () => {
            selectAllDistricts();
        });
    }

    const checkboxes = listEl.querySelectorAll('.district-checkbox');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            toggleDistrictSelection(cb.value);
        });
    });
}

function initDistrictSelector() {
    const btn = document.getElementById('districtDropdownBtn');
    const wrapper = document.querySelector('.district-dropdown-wrapper');
    const menu = document.getElementById('districtDropdownMenu');
    const searchInput = document.getElementById('districtSearchInput');
    const listEl = document.getElementById('districtOptionsList');
    const btnSelectAll = document.getElementById('btnSelectAllDistricts');
    const btnClear = document.getElementById('btnClearDistricts');

    if (!btn || !wrapper || !menu || !listEl) return;

    btn.addEventListener('click', (e) => {
        if (btn.disabled) return;
        e.stopPropagation();
        const isOpen = wrapper.classList.toggle('open');
        btn.setAttribute('aria-expanded', isOpen);
        if (isOpen && searchInput) {
            searchInput.focus();
        }
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
        }
    });

    menu.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    renderDistrictOptions();

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim().toLowerCase();
            const items = listEl.querySelectorAll('.district-option-item:not(.all-districts-option)');
            items.forEach(item => {
                const name = (item.getAttribute('data-name') || '').toLowerCase();
                const visible = name.includes(query);
                item.style.display = visible ? 'flex' : 'none';
            });
        });
    }

    if (btnSelectAll) {
        btnSelectAll.addEventListener('click', () => {
            selectAllDistricts();
        });
    }

    if (btnClear) {
        btnClear.addEventListener('click', () => {
            clearAllDistricts();
        });
    }
}

let drawnItems;
let selectedPolygon = null;

function isPointInPolygon(lat, lng, polygon) {
    // Ray-casting algorithm
    let isInside = false;
    const x = parseFloat(lat);
    const y = parseFloat(lng);
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = parseFloat(polygon[i].lat), yi = parseFloat(polygon[i].lng);
        const xj = parseFloat(polygon[j].lat), yj = parseFloat(polygon[j].lng);

        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
}

function initMap() {
    // Center at Khon Kaen
    map = L.map('map', {
        rotate: true,        // เปิด true tile rotation engine
        bearing: 0,          // เริ่มที่ north-up
        touchRotate: true,   // pinch-rotate gesture บน touch
    }).setView([16.4322, 102.8236], 12);

    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Initialize Leaflet Draw
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    // Initialize District Polygon Layers
    districtPolygonLayer = L.featureGroup().addTo(map);
    initDistrictBaseMap();
    
    const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems },
        draw: {
            polygon: {
                allowIntersection: false,
                drawError: { color: '#e1e100', message: '<strong>เกิดข้อผิดพลาด:</strong> ไม่สามารถวาดเส้นตัดกันได้!' },
                shapeOptions: { color: '#3B82F6' }
            },
            polyline: false,
            rectangle: false,
            circle: false,
            marker: false,
            circlemarker: false
        }
    });
    map.addControl(drawControl);
    
    map.on(L.Draw.Event.CREATED, function (e) {
        drawnItems.clearLayers(); // Only one polygon at a time
        const layer = e.layer;
        drawnItems.addLayer(layer);
        selectedPolygon = layer.getLatLngs()[0];
        setPolygonLockState(true);
        updateRadiusCircle();
    });
    
    map.on(L.Draw.Event.DELETED, function () {
        selectedPolygon = null;
        setPolygonLockState(false);
        updateRadiusCircle();
    });
    
    map.on(L.Draw.Event.EDITED, function (e) {
        e.layers.eachLayer(function (layer) {
            selectedPolygon = layer.getLatLngs()[0];
        });
        setPolygonLockState(true);
        updateRadiusCircle();
    });

    map.on('zoomend zoom', updateMapZoomClass);
    updateMapZoomClass();

    setTimeout(() => {
        updateRadiusCircle(false);
    }, 200);
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

function setPolygonLockState(isLocked) {
    const travelDistEl = document.getElementById('travel-distance');
    const travelDistVal = document.getElementById('travel-distance-val');
    const radiusInfo = document.getElementById('radius-lock-info');

    if (travelDistEl) travelDistEl.disabled = isLocked;

    if (radiusInfo) {
        if (isLocked) {
            radiusInfo.innerHTML = '<i class="fa-solid fa-lock" style="color: #DC2626;"></i> ล็อคเนื่องจากใช้พื้นที่วาดโพลิกอนบนแผนที่';
            radiusInfo.style.color = '#DC2626';
            radiusInfo.style.fontWeight = '500';
        } else {
            radiusInfo.innerHTML = '<i class="fa-solid fa-circle-info"></i> รัศมีที่ต้องการท่องเที่ยว';
            radiusInfo.style.color = 'var(--text-muted)';
            radiusInfo.style.fontWeight = 'normal';
        }
    }

    if (travelDistVal) {
        if (isLocked) {
            travelDistVal.innerHTML = '<i class="fa-solid fa-draw-polygon" style="margin-right: 4px;"></i>ล็อคตามโพลิกอน';
            travelDistVal.style.background = '#FEE2E2';
            travelDistVal.style.color = '#DC2626';
            travelDistVal.style.borderColor = '#FECACA';
        } else {
            travelDistVal.removeAttribute('style');
            travelDistVal.style.cssText = 'font-size: 0.88rem; font-weight: 600; color: var(--primary-color); background: var(--primary-light); padding: 0.15rem 0.6rem; border-radius: 9999px; white-space: nowrap; flex-shrink: 0;';
            const val = travelDistEl ? parseInt(travelDistEl.value) : 50;
            travelDistVal.textContent = val >= 50 ? 'ไม่จำกัด' : `${val} กม.`;
        }
    }

    const districtBtn = document.getElementById('districtDropdownBtn');
    const districtWrapper = document.querySelector('.district-dropdown-wrapper');
    const districtInfo = document.getElementById('district-lock-info');
    const badge = document.getElementById('district-count-badge');

    if (districtBtn) {
        districtBtn.disabled = isLocked;
        if (isLocked) {
            districtBtn.title = "ล็อคเนื่องจากมีการวาดพื้นที่โพลิกอนบนแผนที่";
            if (districtWrapper) districtWrapper.classList.remove('open');
        } else {
            districtBtn.removeAttribute('title');
        }
    }

    if (districtInfo) {
        if (isLocked) {
            districtInfo.innerHTML = '<i class="fa-solid fa-lock" style="color: #DC2626;"></i> ล็อคเนื่องจากใช้พื้นที่วาดโพลิกอนบนแผนที่';
            districtInfo.style.color = '#DC2626';
            districtInfo.style.fontWeight = '500';
        } else {
            districtInfo.innerHTML = '<i class="fa-solid fa-circle-info"></i> สามารถเลือกได้หลายอำเภอตามที่ต้องการ';
            districtInfo.style.color = 'var(--text-muted)';
            districtInfo.style.fontWeight = 'normal';
        }
    }

    if (isLocked) {
        if (badge) {
            badge.innerHTML = '<i class="fa-solid fa-draw-polygon" style="margin-right: 4px;"></i>ล็อคตามโพลิกอน';
            badge.className = 'district-badge-selected';
            badge.style.background = '#FEE2E2';
            badge.style.color = '#DC2626';
            badge.style.borderColor = '#FECACA';
        }
    } else {
        if (badge) {
            badge.removeAttribute('style');
        }
        syncDistrictUI();
    }
}

/**
 * เริ่มติดตาม GPS ของผู้ใช้แบบ realtime และเซ็ตเป็นจุดเริ่มต้น
 */
let lastKnownGPS = null;

async function fetchIPLocationFallback() {
    if (typeof GEOAPIFY_API_KEY !== 'undefined' && GEOAPIFY_API_KEY) {
        try {
            const res = await fetch(`https://api.geoapify.com/v1/ipinfo?apiKey=${GEOAPIFY_API_KEY}`, { signal: AbortSignal.timeout(6000) });
            if (res.ok) {
                const d = await res.json();
                if (d.location?.latitude && d.location?.longitude) {
                    return {
                        lat: d.location.latitude,
                        lng: d.location.longitude,
                        label: d.city?.name || 'ขอนแก่น'
                    };
                }
            }
        } catch (e) {
            console.warn('IP Location fallback error:', e.message);
        }
    }
    return null;
}

function resolveUserLocation(onSuccess, onError) {
    // 1. ถ้ามีตำแหน่งล่าสุดที่เพิ่งดึงได้ ใช้ทันที
    if (lastKnownGPS) {
        onSuccess(lastKnownGPS.lat, lastKnownGPS.lng, false);
        return;
    }

    if (!navigator.geolocation) {
        fetchIPLocationFallback().then(loc => {
            if (loc) {
                lastKnownGPS = { lat: loc.lat, lng: loc.lng };
                onSuccess(loc.lat, loc.lng, true);
            } else {
                onError && onError('เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง');
            }
        });
        return;
    }

    // 2. ลองดึงตำแหน่งแบบ High Accuracy ก่อน (เหมาะกับมือถือ)
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            lastKnownGPS = { lat, lng };
            onSuccess(lat, lng, false);
        },
        (err) => {
            console.warn('High accuracy GPS error:', err.code, err.message);
            // 3. ถ้า High Accuracy ไม่ได้ (เช่น timeout บนคอม/ไม่มีชิป GPS) ให้ลอง Standard Accuracy (Wi-Fi/เครือข่าย)
            navigator.geolocation.getCurrentPosition(
                (pos2) => {
                    const lat = pos2.coords.latitude;
                    const lng = pos2.coords.longitude;
                    lastKnownGPS = { lat, lng };
                    onSuccess(lat, lng, false);
                },
                async (err2) => {
                    console.warn('Standard accuracy GPS error:', err2.code, err2.message);
                    // 4. สำรองสุดท้าย: ดึงพิกัดจาก IP ผ่าน Geoapify
                    const loc = await fetchIPLocationFallback();
                    if (loc) {
                        lastKnownGPS = { lat: loc.lat, lng: loc.lng };
                        onSuccess(loc.lat, loc.lng, true);
                    } else {
                        let msg = 'ไม่สามารถดึงตำแหน่งปัจจุบันได้';
                        if (err.code === 1 || err2.code === 1) {
                            msg = 'กรุณาอนุญาตให้เบราว์เซอร์เข้าถึงตำแหน่ง (Location Permission) หรือเลือกสถานที่เริ่มต้นจากช่องค้นหา';
                        }
                        onError && onError(msg);
                    }
                },
                { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
            );
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
    );
}

/**
 * เริ่มติดตาม GPS ของผู้ใช้แบบ realtime และเซ็ตเป็นจุดเริ่มต้น
 */
function initUserLocation() {
    resolveUserLocation(
        (lat, lng) => {
            startCoords = { lat, lng };
            userIsUsingGPS = true;

            const inputEl = document.getElementById('start-location');
            if (inputEl && !inputEl.dataset.manuallySet) {
                inputEl.value = `📍 ตำแหน่งปัจจุบัน (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            }

            placeUserGPSMarker(lat, lng);
            if (map) map.setView([lat, lng], 14);
            updateRadiusCircle(false);
        },
        (err) => {
            console.warn('GPS initial error:', err);
        }
    );

    // Watch ต่อเนื่อง (realtime)
    if (navigator.geolocation) {
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
                    updateRadiusCircle(false);
                }
            },
            (err) => {
                console.warn('GPS watch error:', err.message);
            },
            { enableHighAccuracy: false, maximumAge: 10000, timeout: 20000 }
        );
    }
}

/**
 * วาง / อัปเดต GPS marker (pulse dot) บนแผนที่
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
        }).addTo(map).bindPopup('<b>📍 จุดเริ่มต้นของคุณ</b><br><small>ตำแหน่ง GPS ปัจจุบัน</small>');
    } else {
        userLiveMarker.setLatLng([lat, lng]);
    }
}

/**
 * ปุ่ม "ตำแหน่งปัจจุบัน" — บังคับ re-center ไปยัง GPS ล่าสุด
 */
function useCurrentLocation() {
    const inputEl = document.getElementById('start-location');
    if (inputEl) {
        inputEl.value = 'กำลังดึงตำแหน่ง...';
        delete inputEl.dataset.manuallySet; // ยกเลิก manual override
    }
    userIsUsingGPS = true;

    resolveUserLocation(
        (lat, lng) => {
            startCoords = { lat, lng };

            if (inputEl) {
                inputEl.value = `📍 ตำแหน่งปัจจุบัน (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            }

            placeUserGPSMarker(lat, lng);
            if (map) {
                map.flyTo([lat, lng], 15, { animate: true, duration: 0.8 });
            }
            updateMap();
        },
        (errMsg) => {
            alert(errMsg || 'ไม่สามารถดึงตำแหน่งปัจจุบันได้');
            if (inputEl) inputEl.value = '';
        }
    );
}

let generatedPlans = [[], [], []];
let currentPlanIndex = 0;
let globalMinRating = 0;
let recentlyUsedPlaceIds = new Set();

// สร้างแผน 3 ตัวเลือกสำหรับ 1 วัน โดยใช้การตั้งค่าเฉพาะของวันนั้นๆ
function generateSingleDayPlans(dayObj, dayIdx, excludedPlaceIds = new Set(), isRecalculate = false) {
    const startTimeStr = dayObj.startTime || '09:00';
    const endTimeStr = dayObj.endTime || '18:00';
    const categories = (dayObj.categories && dayObj.categories.length > 0)
        ? dayObj.categories
        : ['วัด/สถานที่ศักดิ์สิทธิ์', 'ธรรมชาติ', 'คาเฟ่/ถ่ายรูป', 'ตลาด/ช้อปปิ้ง', 'พิพิธภัณฑ์', 'ธรรมชาติ/สวนสัตว์'];

    const dayMinRating = (dayObj.minRating !== undefined && dayObj.minRating !== '') ? parseFloat(dayObj.minRating) : (globalMinRating || 0);
    const placeCountSelection = dayObj.placeCount || document.getElementById('place-count')?.value || 'auto';
    const travelDistanceSelection = dayObj.travelDistance || document.getElementById('travel-distance')?.value || '50';
    const timePerPlaceSelection = 'auto';
    const globalTimeSpent = 60;

    const [sH, sM] = startTimeStr.split(':').map(Number);
    const [eH, eM] = (endTimeStr || '18:00').split(':').map(Number);
    let totalMinutes = (eH * 60 + eM) - (sH * 60 + sM);
    if (totalMinutes <= 0) totalMinutes = 24 * 60 + totalMinutes; // Handle overnight
    const tripStartMin = sH * 60 + sM;
    const tripEndMin = eH * 60 + eM;

    const dayStartCoords = dayObj.startCoords || startCoords || {lat: 16.4322, lng: 102.8236};
    const dayEndCoords = dayObj.endCoords || endCoords;
    const dayEndName = dayObj.endLocation || document.getElementById('end-location')?.value || 'จุดสิ้นสุดการเดินทาง';
    const mode = dayObj.transportMode || document.getElementById('transport-mode')?.value || 'car';

    const dayOfWeek = getDayOfWeekFromDateStr(dayObj.date);
    const allPlaces = getPlaces();

    const filterPlaceCandidate = (p, checkHours = true, excludeOtherDays = true) => {
        const r = p.rating ? parseFloat(p.rating) : 4.0;
        
        let inPolygon = true;
        if (selectedPolygon) {
            inPolygon = isPointInPolygon(p.lat, p.lng, selectedPolygon);
        }

        let inDistrict = true;
        if (!isAllDistricts && selectedDistrictNames && selectedDistrictNames.size > 0) {
            inDistrict = isPointInSelectedDistricts(p.lat, p.lng);
        }

        let inDistance = true;
        const hasSpatialBoundary = selectedPolygon || (!isAllDistricts && selectedDistrictNames && selectedDistrictNames.size > 0);
        const isUnlimited = travelDistanceSelection === 'unlimited' || parseInt(travelDistanceSelection) >= 50;
        if (!hasSpatialBoundary && !isUnlimited && dayStartCoords) {
            const maxDist = parseInt(travelDistanceSelection);
            const R = 6371;
            const dLat = (p.lat - dayStartCoords.lat) * Math.PI / 180;
            const dLng = (p.lng - dayStartCoords.lng) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(dayStartCoords.lat * Math.PI / 180) * Math.cos(p.lat * Math.PI / 180) * 
                      Math.sin(dLng/2) * Math.sin(dLng/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
            const distanceKm = R * c; 
            inDistance = distanceKm <= maxDist;
        }

        let inHours = true;
        if (checkHours && typeof doesPlaceOverlapTripWindow === 'function') {
            inHours = doesPlaceOverlapTripWindow(p, tripStartMin, tripEndMin, dayOfWeek);
        }

        let openOnDay = true;
        if (checkHours && typeof isPlaceOpenOnSpecificDay === 'function') {
            openOnDay = isPlaceOpenOnSpecificDay(p, dayOfWeek);
        }

        let notUsed = true;
        if (excludeOtherDays && excludedPlaceIds && excludedPlaceIds.has(String(p.id))) {
            notUsed = false;
        }

        return categories.includes(p.category) && r >= dayMinRating && inPolygon && inDistrict && inDistance && inHours && openOnDay && notUsed;
    };

    let eligiblePlaces = allPlaces.filter(p => filterPlaceCandidate(p, true, true)).map(p => ({...p}));
    // Fallback 1: หากสถานที่ซ้ำจนหมด ให้ผ่อนปรนการห้ามซ้ำกับวันอื่น
    if (eligiblePlaces.length === 0) {
        eligiblePlaces = allPlaces.filter(p => filterPlaceCandidate(p, true, false)).map(p => ({...p}));
    }
    // Fallback 2: หากสถานที่ยังไม่พอ ให้ผ่อนปรนการตรวจเวลาเปิด-ปิด
    if (eligiblePlaces.length === 0) {
        eligiblePlaces = allPlaces.filter(p => filterPlaceCandidate(p, false, false)).map(p => ({...p}));
    }
    
    const mealsChoice = dayObj.meals || document.getElementById('meals')?.value || 'none';
    let mealCount = 0;
    if (mealsChoice === 'lunch' || mealsChoice === 'dinner') mealCount = 1;
    if (mealsChoice === 'both') mealCount = 2;

    const minTravel = 5;
    const timePerStop = globalTimeSpent + minTravel;
    
    let maxPlaces = 1;
    if (placeCountSelection !== 'auto') {
        maxPlaces = parseInt(placeCountSelection);
    } else {
        maxPlaces = Math.max(1, Math.ceil(totalMinutes / timePerStop) + 2);
        maxPlaces = Math.max(1, maxPlaces - mealCount);
    }

    let nonRestPlaces = eligiblePlaces.filter(p => p.category !== 'ร้านอาหาร');
    if (nonRestPlaces.length < maxPlaces) {
        nonRestPlaces = eligiblePlaces;
    }

    const dayPlans = [[], [], []];
    const pickedInThisDayRound = new Set();

    for (let planIdx = 0; planIdx < 3; planIdx++) {
        let actualMax = Math.min(maxPlaces, nonRestPlaces.length);

        let candidates = nonRestPlaces.filter(p => 
            !pickedInThisDayRound.has(String(p.id)) &&
            (!excludedPlaceIds || !excludedPlaceIds.has(String(p.id)))
        ).sort(() => 0.5 - Math.random());

        let pickedPlaces = [];
        if (candidates.length >= actualMax) {
            pickedPlaces = candidates.slice(0, actualMax);
        } else {
            pickedPlaces = [...candidates];
            let needed = actualMax - pickedPlaces.length;
            let pickedIds = new Set(pickedPlaces.map(p => String(p.id)));

            let tier2 = nonRestPlaces.filter(p => 
                !pickedInThisDayRound.has(String(p.id)) && 
                !pickedIds.has(String(p.id))
            ).sort(() => 0.5 - Math.random());
            pickedPlaces.push(...tier2.slice(0, needed));
            needed = actualMax - pickedPlaces.length;

            if (needed > 0) {
                pickedIds = new Set(pickedPlaces.map(p => String(p.id)));
                let tier3 = nonRestPlaces.filter(p => !pickedIds.has(String(p.id))).sort(() => 0.5 - Math.random());
                pickedPlaces.push(...tier3.slice(0, needed));
            }
        }

        pickedPlaces.forEach(p => pickedInThisDayRound.add(String(p.id)));
        
        let planItinerary = [];
        if (dayStartCoords && pickedPlaces.length > 0) {
            let unvisited = [...pickedPlaces];
            let optimized = [];
            let currentLoc = dayStartCoords;
            let currentSimMinutes = tripStartMin;
            
            while (unvisited.length > 0) {
                let bestIdx = 0;
                let bestScore = Infinity;
                
                for (let i = 0; i < unvisited.length; i++) {
                    const p = unvisited[i];
                    const travelMins = getTravelTime(currentLoc, p, mode) || 15;
                    const estArrivalMin = currentSimMinutes + travelMins;
                    const pStay = (timePerPlaceSelection !== 'auto') ? parseInt(timePerPlaceSelection) : (p.timeSpent || globalTimeSpent);
                    
                    const dLat = currentLoc.lat - p.lat;
                    const dLng = currentLoc.lng - p.lng;
                    const geoDist = Math.sqrt(dLat * dLat + dLng * dLng);
                    
                    let score = geoDist;
                    if (typeof isPlaceOpenAtTime === 'function') {
                        const openCheck = isPlaceOpenAtTime(p, estArrivalMin, pStay, dayOfWeek);
                        if (!openCheck.isOpen) {
                            score += openCheck.tooEarly ? 1000 : 5000;
                        }
                    }
                    
                    if (score < bestScore) {
                        bestScore = score;
                        bestIdx = i;
                    }
                }
                
                const chosen = unvisited[bestIdx];
                const travelMins = getTravelTime(currentLoc, chosen, mode) || 15;
                const chosenStay = (timePerPlaceSelection !== 'auto') ? parseInt(timePerPlaceSelection) : (chosen.timeSpent || globalTimeSpent);
                currentSimMinutes += travelMins + chosenStay;
                currentLoc = chosen;
                optimized.push(chosen);
                unvisited.splice(bestIdx, 1);
            }
            if (timePerPlaceSelection !== 'auto') {
                optimized.forEach(p => p.timeSpent = parseInt(timePerPlaceSelection));
            }
            planItinerary = injectMeals(optimized, mealsChoice, sH, sM);
        } else {
            if (typeof parseOpeningHours === 'function') {
                pickedPlaces.sort((a, b) => {
                    const aH = parseOpeningHours(a.opening_hours || a.openingHours);
                    const bH = parseOpeningHours(b.opening_hours || b.openingHours);
                    return aH.openMin - bH.openMin;
                });
            }
            if (timePerPlaceSelection !== 'auto') {
                pickedPlaces.forEach(p => p.timeSpent = parseInt(timePerPlaceSelection));
            }
            planItinerary = injectMeals(pickedPlaces, mealsChoice, sH, sM);
        }
        
        if (dayEndCoords) {
            planItinerary.push({
                id: 'end_' + Date.now() + Math.random(),
                name: dayEndName,
                lat: dayEndCoords.lat,
                lng: dayEndCoords.lng,
                timeSpent: 0,
                isEndLocation: true,
                category: 'จุดสิ้นสุด'
            });
        }
        
        dayPlans[planIdx] = planItinerary;
    }

    return dayPlans;
}

// สร้างแผนการท่องเที่ยวสำหรับทุกวันที่ผู้ใช้เลือก (Multi-Day Generation)
async function generatePlan(isRecalculate = false) {
    saveCurrentDayState();

    // 1. แสดงผลลัพธ์และปุ่มในมุมมองมือถือ
    document.getElementById('sidebar-result').style.display = 'flex';
    document.querySelectorAll('.plan-tab').forEach((tab, i) => {
        tab.classList.toggle('active', i === 0);
    });

    const tabResultBtn = document.getElementById('tabBtnResult');
    if (tabResultBtn) tabResultBtn.style.display = 'flex';
    if (window.innerWidth <= 820) switchMobileView('result');

    const totalDays = tripDays.length;
    document.getElementById('itinerary-list').innerHTML = `
        <div style="padding: 30px 20px; text-align: center; color: var(--primary-color);">
            <i class="fa-solid fa-spinner fa-spin" style="font-size: 2.2rem; margin-bottom: 0.75rem; display: block;"></i>
            <div style="font-weight: 600; font-size: 1.05rem;">กำลังสร้างแผนการท่องเที่ยว ${totalDays > 1 ? `${totalDays} วัน` : ''}...</div>
            <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">คัดกรองวันเปิดทำการและจัดเส้นทางแต่ละวันแยกกัน</div>
        </div>
    `;

    currentRouteCoords = null;
    currentRouteIndices = null;

    const allTripUsedPlaceIds = new Set();
    const daysToGenerate = isRecalculate ? [activeDayIndex] : tripDays.map((_, i) => i);

    if (isRecalculate) {
        tripDays.forEach((d, idx) => {
            if (idx !== activeDayIndex && Array.isArray(d.itinerary)) {
                d.itinerary.forEach(p => {
                    if (p.id && !p.isEndLocation && !p.isMeal) allTripUsedPlaceIds.add(String(p.id));
                });
            }
        });
    }

    // สร้างแผนของแต่ละวัน
    for (const d of daysToGenerate) {
        const day = tripDays[d];
        const dayPlans = generateSingleDayPlans(day, d, allTripUsedPlaceIds, isRecalculate);
        day.generatedPlans = dayPlans;
        day.currentPlanIndex = 0;
        day.itinerary = dayPlans[0] || [];

        // บันทึกสถานที่ที่ถูกเลือกแล้ว เพื่อไม่ให้วันที่ถัดไปเลือกสถานที่ซ้ำกัน
        if (Array.isArray(day.itinerary)) {
            day.itinerary.forEach(p => {
                if (p.id && !p.isEndLocation && !p.isMeal) {
                    allTripUsedPlaceIds.add(String(p.id));
                }
            });
        }
    }

    // กำหนดค่าแผนปัจจุบันตาม activeDayIndex
    currentPlanIndex = 0;
    currentItinerary = tripDays[activeDayIndex].itinerary;
    generatedPlans = tripDays[activeDayIndex].generatedPlans;

    // คำนวณเวลาเดินทางจริงสำหรับวันที่กำลังแสดง
    try {
        await updateScheduleWithRealTimes(true);
        if (tripDays[activeDayIndex]) {
            tripDays[activeDayIndex].itinerary = currentItinerary;
            tripDays[activeDayIndex].currentRouteCoords = currentRouteCoords;
            tripDays[activeDayIndex].currentRouteIndices = currentRouteIndices;
        }
    } catch (err) {
        console.error("Schedule error:", err);
        renderItineraryList();
    }

    renderDayTabs();
    updateMap();
}

function switchPlan(index) {
    if (index === currentPlanIndex) return; // Already on this plan
    
    // Update tabs UI
    document.querySelectorAll('.plan-tab').forEach((tab, i) => {
        if (i === index) tab.classList.add('active');
        else tab.classList.remove('active');
    });
    
    currentPlanIndex = index;
    currentItinerary = generatedPlans[index];
    if (typeof tripDays !== 'undefined' && tripDays[activeDayIndex]) {
        tripDays[activeDayIndex].itinerary = currentItinerary;
        tripDays[activeDayIndex].currentPlanIndex = currentPlanIndex;
    }
    
    document.getElementById('itinerary-list').innerHTML = '<div style="padding: 20px; text-align: center; color: var(--primary-color);"><i class="fa-solid fa-spinner fa-spin"></i> กำลังคำนวณเวลาเดินทางจริง...</div>';
    currentRouteCoords = null;
    currentRouteIndices = null;
    
    updateScheduleWithRealTimes(true).then(() => {
        if (typeof tripDays !== 'undefined' && tripDays[activeDayIndex]) {
            tripDays[activeDayIndex].itinerary = currentItinerary;
        }
        updateMap();
    }).catch(err => {
        console.error("Schedule error:", err);
        renderItineraryList();
        updateMap();
    });
}

function renderItineraryList() {
    const list = document.getElementById('itinerary-list');
    if (!list) return; // safeguard
    list.innerHTML = '';
    
    if (currentItinerary.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">ไม่พบสถานที่ กรุณาเลือกหมวดหมู่ใหม่</div>';
        updateSummary();
        return;
    }
    
    try {
        let startTimeStr = document.getElementById('start-time').value || '09:00';
        
        // Update the badge in the UI
        const badge = document.getElementById('start-time-badge');
        if (badge) badge.innerText = startTimeStr;
        const startText = document.getElementById('start-point-text');
        if (startText) startText.innerText = startTimeStr;
        
        let [hours, minutes] = startTimeStr.split(':').map(Number);
        if (isNaN(hours)) hours = 9;
        if (isNaN(minutes)) minutes = 0;
        
        let prevLoc = startCoords;
        const mode = document.getElementById('transport-mode').value;
        
        currentItinerary.forEach((place, index) => {
            const timeToSpend = place.timeSpent !== undefined ? place.timeSpent : 60;
            
            // Add travel time from previous location
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
            
            // Check opening hours status for UI
            let openBadgeHtml = '';
            const hoursText = place.opening_hours || place.openingHours || '';
            if (hoursText && !place.isEndLocation) {
                const [pH, pM] = (place.startTime || '09:00').split(':').map(Number);
                const arrivalMin = (pH || 0) * 60 + (pM || 0);
                if (typeof isPlaceOpenAtTime === 'function') {
                    const status = isPlaceOpenAtTime(place, arrivalMin, timeToSpend);
                    if (status.isOpen) {
                        openBadgeHtml = `<span style="color: #059669; font-size: 0.78rem; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-regular fa-clock"></i> ${hoursText} <span style="background: #D1FAE5; color: #065F46; padding: 1px 6px; border-radius: 8px; font-size: 0.7rem;">เปิด</span></span>`;
                    } else {
                        openBadgeHtml = `<span style="color: #DC2626; font-size: 0.78rem; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-regular fa-clock"></i> ${hoursText} <span style="background: #FEE2E2; color: #991B1B; padding: 1px 6px; border-radius: 8px; font-size: 0.7rem;"><i class="fa-solid fa-triangle-exclamation"></i> อาจปิดทำการ</span></span>`;
                    }
                } else {
                    openBadgeHtml = `<span style="color: var(--text-muted); font-size: 0.78rem; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-regular fa-clock"></i> ${hoursText}</span>`;
                }
            }

            // ตรวจสอบวันที่เปิดทำการ (open_days) กับวันที่ท่องเที่ยวที่เลือก
            let dayBadgeHtml = '';
            if (!place.isEndLocation && typeof isPlaceOpenOnTripDay === 'function') {
                const openOnDay = isPlaceOpenOnTripDay(place);
                const tripDayName = DAY_NAMES_TH ? DAY_NAMES_TH[getActiveDayOfWeek()] : '';
                if (!openOnDay) {
                    dayBadgeHtml = `<span class="day-closed-badge"><i class="fa-solid fa-calendar-xmark"></i> ปิดวัน${tripDayName}</span>`;
                }
            }

            // Render HTML
            const item = document.createElement('div');
            item.className = 'itinerary-item';
            item.dataset.id = place.id || ('temp_' + index);
            const mealBadge = place.isMeal ? '<span style="background:#EF4444; color:white; padding:2px 8px; border-radius:12px; font-size:0.75rem; margin-left:5px;">แวะทานอาหาร</span>' : '';
            item.innerHTML = `
                <div class="item-time">${place.startTime}</div>
                <div class="item-details">
                    <h4>${place.name || 'สถานที่'} ${mealBadge}</h4>
                    <p style="display: flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-hourglass-half"></i> 
                        <input type="number" value="${place.timeSpent}" min="5" step="5" style="width: 60px; padding: 2px 5px; border-radius: 4px; border: 1px solid #ccc; font-family: inherit;" onchange="updatePlaceTime('${place.id}', this.value)"> นาที
                    </p>
                    <p style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
                        <span><i class="fa-solid fa-tag"></i> ${place.category || '-'}</span>
                        <span style="color: #F59E0B; font-weight: 500;"><i class="fa-solid fa-star"></i> ${place.rating || '4.5'}</span>
                        ${openBadgeHtml}
                        ${dayBadgeHtml}
                    </p>
                </div>
                <div class="item-actions">
                    <i class="fa-solid fa-xmark action-icon" onclick="removePlace('${place.id}')"></i>
                </div>
            `;
            list.appendChild(item);
        });
        
        updateMap();
        updateSummary();
    } catch (e) {
        console.error("Render error:", e);
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: #EF4444;">เกิดข้อผิดพลาดในการแสดงผล กรุณาลองใหม่</div>';
    }
}

window.updatePlaceTime = function(id, newTime) {
    const time = parseInt(newTime);
    if (isNaN(time) || time < 5) return;
    
    const targetId = String(id);
    const place = currentItinerary.find(p => String(p.id) === targetId);
    if (place) {
        place.timeSpent = time;
        // Re-render to update the calculated times without trimming places
        renderItineraryList();
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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

function createTripPlanPopupHTML(place, index) {
    const name = escapeHtml(place.name || 'สถานที่ท่องเที่ยว');
    const category = escapeHtml(place.category || 'ทั่วไป');
    const catIcon = getCategoryIcon(place.category);
    const image = escapeHtml(place.image || 'https://images.unsplash.com/photo-1590766940554-638092019c00?auto=format&fit=crop&w=400&q=80');
    const rating = place.rating ? Number(place.rating).toFixed(1) : '4.5';
    const hours = escapeHtml(place.opening_hours || place.openingHours || '08:00 - 18:00 น.');
    const desc = escapeHtml(place.description || 'สถานที่ท่องเที่ยวยอดนิยมในจังหวัดขอนแก่น');
    
    const stopLabel = place.isEndLocation ? 'จุดสิ้นสุด' : `จุดที่ ${index + 1}`;
    const timeDisplay = (place.startTime && place.endTime) 
        ? `<div class="place-popup-time-badge"><i class="fa-regular fa-clock"></i> ${escapeHtml(place.startTime)} - ${escapeHtml(place.endTime)} (${place.timeSpent || 60} นาที)</div>`
        : (place.startTime ? `<div class="place-popup-time-badge"><i class="fa-regular fa-clock"></i> ${escapeHtml(place.startTime)}</div>` : '');

    return `
        <div class="place-popup-card">
            <div class="place-popup-img-wrapper">
                <img class="place-popup-img" src="${image}" alt="${name}" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1590766940554-638092019c00?auto=format&fit=crop&w=400&q=80';">
                <div class="place-popup-stop-badge">${stopLabel}</div>
                <div class="place-popup-cat-badge">
                    <i class="${catIcon}"></i> ${category}
                </div>
            </div>
            <div class="place-popup-body">
                <div class="place-popup-title">${place.isEndLocation ? '' : (index + 1) + '. '}${name}</div>
                ${timeDisplay}
                <div class="place-popup-meta">
                    <span class="place-popup-rating"><i class="fa-solid fa-star"></i> ${rating}</span>
                    <span class="place-popup-hours"><i class="fa-regular fa-clock"></i> ${hours}</span>
                </div>
                ${desc ? `<div class="place-popup-desc">${desc}</div>` : ''}
            </div>
        </div>
    `;
}

function formatTime(h, m) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

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
    document.getElementById('itinerary-list').innerHTML = '<div style="padding: 20px; text-align: center; color: var(--primary-color);"><i class="fa-solid fa-spinner fa-spin"></i> กำลังคำนวณเวลาเดินทางจริง...</div>';
    updateScheduleWithRealTimes().then(() => {
        if (typeof tripDays !== 'undefined' && tripDays[activeDayIndex]) {
            tripDays[activeDayIndex].itinerary = currentItinerary;
        }
        updateMap();
    });
}

function removePlace(id) {
    const targetId = String(id);
    currentItinerary = currentItinerary.filter(p => String(p.id) !== targetId);
    if (typeof tripDays !== 'undefined' && tripDays[activeDayIndex]) {
        tripDays[activeDayIndex].itinerary = currentItinerary;
    }
    renderItineraryList();
}

function updateMap() {
    // Clear existing markers — แต่ยกเว้น userLiveMarker (GPS dot จัดการแยก)
    markers.forEach(m => {
        if (m !== userLiveMarker) map.removeLayer(m);
    });
    markers = [];
    routeLines.forEach(l => map.removeLayer(l));
    routeLines = [];
    if (routingControl) map.removeControl(routingControl);
    updateRadiusCircle();
    
    const latlngs = [];
    
    if (startCoords) {
        const startLatLng = [startCoords.lat, startCoords.lng];
        latlngs.push(startLatLng);

        if (userIsUsingGPS) {
            // Re-add GPS marker กลับเข้าแผนที่ (กรณีที่ถูก remove ไปก่อนหน้า)
            if (userLiveMarker) {
                userLiveMarker.setLatLng([startCoords.lat, startCoords.lng]);
                if (!map.hasLayer(userLiveMarker)) {
                    userLiveMarker.addTo(map);
                }
                // ไม่ push เข้า markers[] เพื่อป้องกันถูก removeLayer รอบถัดไป
            } else {
                placeUserGPSMarker(startCoords.lat, startCoords.lng);
            }
        } else {
            // ใช้ flag marker แบบเดิมเมื่อผู้ใช้เซ็ตเองด้วยมือ
            const startMarker = L.marker(startLatLng, {
                icon: L.divIcon({
                    className: 'start-marker-container',
                    html: '<div class="start-marker-pin"><i class="fa-solid fa-flag"></i></div>',
                    iconSize: [34, 34],
                    iconAnchor: [17, 34]
                })
            }).addTo(map).bindPopup(`<b>จุดเริ่มต้น</b>`);
            markers.push(startMarker);
        }
    }

    if (currentItinerary.length === 0) return;
    
    currentItinerary.forEach((place, index) => {
        const latlng = [place.lat, place.lng];
        latlngs.push(latlng);
        
        let markerHtml = '';
        let iconSize = [44, 44];
        let iconAnchor = [22, 22];

        if (place.isEndLocation) {
            const isSameAsStart = startCoords && (Math.abs(startCoords.lat - place.lat) < 0.0001 && Math.abs(startCoords.lng - place.lng) < 0.0001);
            if (isSameAsStart) return; // Skip rendering the end marker entirely
            
            markerHtml = `
                <div class="end-marker-pin">
                    <i class="fa-solid fa-flag-checkered"></i>
                </div>
            `;
            iconSize = [40, 40];
            iconAnchor = [20, 40];
        } else {
            markerHtml = `
                <div class="place-marker">
                    <div class="place-marker-img" style="background-image: url('${place.image || 'https://via.placeholder.com/150'}')"></div>
                    <div class="place-marker-num">${index + 1}</div>
                </div>
            `;
        }
        
        const marker = L.marker(latlng, {
            icon: L.divIcon({
                className: 'place-marker-container',
                html: markerHtml,
                iconSize: iconSize,
                iconAnchor: iconAnchor
            })
        }).addTo(map)
            .bindPopup(createTripPlanPopupHTML(place, index), {
                className: 'custom-place-popup',
                maxWidth: 290,
                closeButton: true
            });
        markers.push(marker);
    });
    
    // Draw actual route along roads
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
        
        // Draw dashed lines for any remaining markers that don't have an OSRM route
        for (let i = currentRouteIndices.length - 1; i < latlngs.length - 1; i++) {
            const color = segmentColors[i % segmentColors.length];
            const segmentLine = L.polyline([latlngs[i], latlngs[i+1]], {
                color: color,
                weight: 5,
                opacity: 0.8,
                dashArray: '10, 10'
            }).addTo(map);
            routeLines.push(segmentLine);
        }
    } else {
        // Fallback: draw straight lines if OSRM failed
        for (let i = 0; i < latlngs.length - 1; i++) {
            const color = segmentColors[i % segmentColors.length];
            const segmentLine = L.polyline([latlngs[i], latlngs[i+1]], {
                color: color,
                weight: 5,
                opacity: 0.8,
                dashArray: '10, 10'
            }).addTo(map);
            routeLines.push(segmentLine);
        }
    }
    
    // Zoom map to fit all markers and routes
    if (markers.length > 0) {
        const group = new L.featureGroup([...markers, ...routeLines]);
        const bounds = group.getBounds();
        if (bounds.isValid()) {
            lastRouteBounds = bounds; // บันทึกไว้สำหรับใช้ตอน switch มาหน้า map
            map.invalidateSize();
            map.fitBounds(bounds, { padding: [70, 70] });
        }
    }
}

function updateSummary() {
    // Very rough estimation based on 1 deg ~ 111km
    let distance = 0;
    let waypointsForDist = [];
    if (startCoords) waypointsForDist.push(startCoords);
    currentItinerary.forEach(p => waypointsForDist.push(p));
    
    for (let i = 0; i < waypointsForDist.length - 1; i++) {
        const p1 = waypointsForDist[i];
        const p2 = waypointsForDist[i+1];
        const dLat = p1.lat - p2.lat;
        const dLng = p1.lng - p2.lng;
        distance += Math.sqrt(dLat*dLat + dLng*dLng) * 111;
    }
    
    let startTimeStr = document.getElementById('start-time').value || '09:00';
    let [sH, sM] = startTimeStr.split(':').map(Number);
    if (isNaN(sH)) sH = 9;
    if (isNaN(sM)) sM = 0;
    
    const startStr = currentItinerary.length > 0 ? formatTime(sH, sM) : '--';
    const endStr = currentItinerary.length > 0 ? currentItinerary[currentItinerary.length-1].endTime : '--';
    
    document.getElementById('summary-time').innerText = `${startStr} - ${endStr}`;
    document.getElementById('summary-distance').innerText = `~ ${distance.toFixed(1)} กม.`;
}

function resetForm() {
    document.getElementById('sidebar-result').style.display = 'none';
    document.getElementById('sidebar-form').style.display = 'flex';
    if (window.innerWidth <= 820) {
        switchMobileView('form');
    }
    if (currentItinerary.length > 0) {
        document.getElementById('view-current-plan-btn').style.display = 'block';
    } else {
        document.getElementById('view-current-plan-btn').style.display = 'none';
    }
}

function showCurrentPlan() {
    document.getElementById('sidebar-form').style.display = 'none';
    document.getElementById('sidebar-result').style.display = 'flex';
    if (window.innerWidth <= 820) {
        switchMobileView('result');
    }
    document.getElementById('itinerary-list').innerHTML = '<div style="padding: 20px; text-align: center; color: var(--primary-color);"><i class="fa-solid fa-spinner fa-spin"></i> กำลังปรับปรุงแผน...</div>';
    
    // We do NOT clear currentRouteCoords here so it can try to reuse them
    updateScheduleWithRealTimes(true).then(() => {
        updateMap();
    }).catch(err => {
        console.error("Schedule error:", err);
        renderItineraryList();
        updateMap();
    });
}

function recalculateRoute() {
    const itineraryList = document.getElementById('itinerary-list');
    if (itineraryList) {
        itineraryList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--primary-color);"><i class="fa-solid fa-spinner fa-spin"></i> กำลังค้นหาสถานที่ใหม่และคำนวณเส้นทาง...</div>';
    }
    generatePlan(true);
}

// Add Place Modal Logic
const modal = document.getElementById('addPlaceModal');

function openAddPlaceModal() {
    const allPlaces = getPlaces();
    // Filter out places already in itinerary
    const currentIds = currentItinerary.map(p => String(p.id));
    const available = allPlaces.filter(p => !currentIds.includes(String(p.id)));
    
    const list = document.getElementById('available-places');
    list.innerHTML = '';
    
    if(available.length === 0) {
        list.innerHTML = '<p>ไม่มีสถานที่ให้เพิ่มแล้ว</p>';
    } else {
        available.forEach(place => {
            const placeIdStr = String(place.id);
            const item = document.createElement('div');
            item.className = 'add-place-item';
            item.innerHTML = `
                <div>
                    <h4>${place.name}</h4>
                    <p style="font-size: 0.8rem; color: var(--text-muted);">
                        <span style="margin-right: 10px;">${place.category}</span>
                        <span style="color: #F59E0B; font-weight: 500;"><i class="fa-solid fa-star"></i> ${place.rating || '4.5'}</span>
                    </p>
                </div>
                <button class="btn btn-primary small-btn" onclick="addPlaceToItinerary('${placeIdStr}')">เพิ่ม</button>
            `;
            list.appendChild(item);
        });
    }
    
    modal.style.display = 'block';
}

function closeAddPlaceModal() {
    modal.style.display = 'none';
}

function addPlaceToItinerary(id) {
    const allPlaces = getPlaces();
    const targetId = String(id);
    const place = allPlaces.find(p => String(p.id) === targetId);
    if(place) {
        const placeClone = {...place, id: String(place.id)};
        const globalTimeSpent = parseInt(document.getElementById('time-per-place')?.value) || 60;
        placeClone.timeSpent = globalTimeSpent;
        currentItinerary.push(placeClone);
        renderItineraryList();
    }
    closeAddPlaceModal();
}

window.onclick = function(event) {
    if (event.target == modal) {
        closeAddPlaceModal();
    }
}

let currentRouteCoords = null;
let currentRouteIndices = null;

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
            if (response.status === 400) return null; // Bad request — no route possible
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
    // waypoints param บอก OSRM ว่าต้องผ่านทุกจุด (ไม่ shortcut ข้ามจุดใดจุดหนึ่ง)
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
            return { times, coords, indices };
        } else if (data.code === 'NoRoute' && !useRadiuses) {
            return getRealTravelTimes(waypoints, mode, true);
        }
    } catch (err) {
        console.error('OSRM fetch error:', err);
    }
    return null;
}

async function updateScheduleWithRealTimes(trimToFit = false) {
    if (currentItinerary.length === 0) {
        renderItineraryList(); // Ensures UI updates even if empty
        return;
    }
    
    const waypoints = [];
    if (startCoords) waypoints.push(startCoords);
    currentItinerary.forEach(p => waypoints.push(p));
    
    const mode = document.getElementById('transport-mode').value;
    const result = await getRealTravelTimes(waypoints, mode);
    
    if (result && result.times && result.times.length >= currentItinerary.length) {
        if (result.coords && result.indices) {
            currentRouteCoords = result.coords;
            currentRouteIndices = result.indices;
        }
        
        // Safe assignment
        const offset = result.times.length - currentItinerary.length;
        currentItinerary.forEach((p, i) => {
            p.realTravelMins = result.times[i + offset] || 15; 
        });
    } else {
        // Fallback
        let prev = startCoords;
        currentItinerary.forEach(p => {
            p.realTravelMins = getTravelTime(prev, p, mode);
            prev = p;
        });
    }
    
    if (trimToFit) {
        let startTimeStr = document.getElementById('start-time').value || '09:00';
        let endTimeStr = document.getElementById('end-time').value || '18:00';
        let [sH, sM] = startTimeStr.split(':').map(Number);
        let [eH, eM] = endTimeStr.split(':').map(Number);
        let startTotalMins = sH * 60 + sM;
        let endTotalMins = eH * 60 + eM;
        if (endTotalMins <= startTotalMins) endTotalMins += 24 * 60;
        
        let accumulatedMins = startTotalMins;
        let validItinerary = [];
        
        const originalLength = currentItinerary.length;
        
        // Extract end location if any
        let endLocPlace = null;
        if (currentItinerary.length > 0 && currentItinerary[currentItinerary.length - 1].isEndLocation) {
            endLocPlace = currentItinerary.pop(); // Remove it temporarily for the trim loop
        }
        
        for (let i = 0; i < currentItinerary.length; i++) {
            const p = currentItinerary[i];
            const travelMins = p.realTravelMins !== undefined ? p.realTravelMins : 15;
            const timeToSpend = p.timeSpent !== undefined ? p.timeSpent : 60;
            
            let projectedEnd = accumulatedMins + travelMins + timeToSpend;
            
            if (projectedEnd <= endTotalMins) {
                // Fits perfectly or leaves a gap
                validItinerary.push(p);
                accumulatedMins = projectedEnd;
            } else {
                // Overshoots! Let's see if we can reduce its time to fit
                let overshoot = projectedEnd - endTotalMins;
                let adjustedTime = timeToSpend - overshoot;
                
                if (adjustedTime >= 15) {
                    // It fits and is not less than 15 mins! Add it and adjust its time.
                    p.timeSpent = adjustedTime;
                    p.isOptional = true; // Mark as optional/adjusted place
                    validItinerary.push(p);
                    accumulatedMins = endTotalMins;
                } else {
                    // Cannot add this place because it would drop below 15 mins.
                    // We stop here and will absorb the gap into the PREVIOUS place.
                }
                break;
            }
        }
        
        // Now append the end location back and reserve its travel time!
        if (endLocPlace) {
            const prevLoc = validItinerary.length > 0 ? validItinerary[validItinerary.length - 1] : startCoords;
            const mode = document.getElementById('transport-mode').value;
            const travelToEnd = getTravelTime(prevLoc, endLocPlace, mode);
            
            endLocPlace.realTravelMins = travelToEnd;
            validItinerary.push(endLocPlace);
            accumulatedMins += travelToEnd;
        }
        
        // If there's still a gap to fill, absorb it into the LAST NON-MEAL place to ensure the trip ends exactly on time
        if (accumulatedMins < endTotalMins && validItinerary.length > 0) {
            let gap = endTotalMins - accumulatedMins;
            for (let j = validItinerary.length - 1; j >= 0; j--) {
                if (!validItinerary[j].isMeal && !validItinerary[j].isEndLocation) {
                    validItinerary[j].timeSpent += gap;
                    break;
                }
            }
        } else if (accumulatedMins > endTotalMins && validItinerary.length > 0) {
            // We overshot because of travel time to end location. We must squish previous places!
            let overshoot = accumulatedMins - endTotalMins;
            for (let j = validItinerary.length - 1; j >= 0; j--) {
                if (!validItinerary[j].isMeal && !validItinerary[j].isEndLocation) {
                    if (validItinerary[j].timeSpent > overshoot + 5) { // Must leave at least 5 mins
                        validItinerary[j].timeSpent -= overshoot;
                        break;
                    }
                }
            }
        }
        
        const keepCount = validItinerary.length;
        
        currentItinerary = validItinerary;
        generatedPlans[currentPlanIndex] = currentItinerary;
        
        // If we shrunk the itinerary, re-fetch the route from OSRM so we get a perfect solid line 
        // connecting to the end location, instead of falling back to dashed straight lines.
        if (keepCount !== originalLength) {
            
            const newWaypoints = [];
            if (startCoords) newWaypoints.push(startCoords);
            validItinerary.forEach(p => newWaypoints.push(p));
            
            const mode = document.getElementById('transport-mode').value;
            const finalResult = await getRealTravelTimes(newWaypoints, mode);
            if (finalResult && finalResult.coords && finalResult.indices) {
                currentRouteCoords = finalResult.coords;
                currentRouteIndices = finalResult.indices;
            } else {
                currentRouteCoords = null;
                currentRouteIndices = null;
            }
        }
    }
    
    renderItineraryList();
}

// Helper functions for meals and travel
function getTravelTime(loc1, loc2, mode = 'car') {
    if (!loc1 || !loc2) return 15;
    
    // Haversine formula for distance
    const R = 6371; // km
    const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
    const dLng = (loc2.lng - loc1.lng) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) * 
        Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distanceKm = R * c; 
    
    let timeMins = 0;
    let bufferMins = 0;
    
    if (mode === 'motorcycle') {
        // Motorcycle: ~40 km/h (1.5 mins per km), easy parking
        timeMins = Math.round(distanceKm * 1.5);
        bufferMins = 2;
    } else {
        // Car: ~30 km/h (2 mins per km), harder parking
        timeMins = Math.round(distanceKm * 2);
        bufferMins = 5;
    }
    
    return Math.max(5, Math.min(60, timeMins + bufferMins));
}

function findClosest(places, targetLoc, excludeList, targetMinute = null) {
    let best = null;
    let minDist = Infinity;
    const excludeIds = excludeList.map(p => p.id);
    
    // First pass: look for restaurants/cafes that are actually OPEN at targetMinute
    places.forEach(p => {
        if (excludeIds.includes(p.id)) return;
        if (targetMinute !== null && typeof isPlaceOpenAtTime === 'function') {
            const check = isPlaceOpenAtTime(p, targetMinute, 60);
            if (!check.isOpen) return;
        }
        const dLat = p.lat - targetLoc.lat;
        const dLng = p.lng - targetLoc.lng;
        const dist = dLat * dLat + dLng * dLng;
        if (dist < minDist) {
            minDist = dist;
            best = p;
        }
    });
    
    // Fallback: if no open restaurant found, find closest without strict opening constraint
    if (!best) {
        places.forEach(p => {
            if (excludeIds.includes(p.id)) return;
            const dLat = p.lat - targetLoc.lat;
            const dLng = p.lng - targetLoc.lng;
            const dist = dLat * dLat + dLng * dLng;
            if (dist < minDist) {
                minDist = dist;
                best = p;
            }
        });
    }
    
    return best ? {...best} : null;
}

function injectMeals(itinerary, mealsChoice, startH, startM) {
    if (mealsChoice === 'none' || itinerary.length === 0) return itinerary;
    
    let result = [];
    let h = startH, m = startM;
    let lunchAdded = false;
    let dinnerAdded = false;
    const mode = document.getElementById('transport-mode').value;
    
    const travelDistanceSelection = document.getElementById('travel-distance').value;
    const allPlaces = getPlaces();
    const restaurants = allPlaces.filter(p => {
        if (p.category !== 'ร้านอาหาร' && p.category !== 'คาเฟ่/ถ่ายรูป') return false;
        
        let inDistrict = true;
        if (!isAllDistricts && selectedDistrictNames.size > 0) {
            inDistrict = isPointInSelectedDistricts(p.lat, p.lng);
        }
        if (!inDistrict) return false;

        const hasSpatialBoundary = selectedPolygon || (!isAllDistricts && selectedDistrictNames.size > 0);
        const isUnlimited = travelDistanceSelection === 'unlimited' || parseInt(travelDistanceSelection) >= 50;
        if (selectedPolygon) {
            return isPointInPolygon(p.lat, p.lng, selectedPolygon);
        } else if (!hasSpatialBoundary && !isUnlimited && startCoords) {
            const maxDist = parseInt(travelDistanceSelection);
            const R = 6371;
            const dLat = (p.lat - startCoords.lat) * Math.PI / 180;
            const dLng = (p.lng - startCoords.lng) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(startCoords.lat * Math.PI / 180) * Math.cos(p.lat * Math.PI / 180) * 
                      Math.sin(dLng/2) * Math.sin(dLng/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
            const distanceKm = R * c; 
            return distanceKm <= maxDist;
        }
        return true;
    });

    for (let i = 0; i < itinerary.length; i++) {
        const place = itinerary[i];
        
        // Check for Lunch (around 11:00 - 14:00)
        if ((mealsChoice === 'lunch' || mealsChoice === 'both') && !lunchAdded && h >= 11 && h < 14) {
            const prevLoc = result.length > 0 ? result[result.length - 1] : (startCoords || place);
            const currentMin = h * 60 + m;
            const bestRest = findClosest(restaurants, prevLoc, result, currentMin);
            if (bestRest) {
                bestRest.id = 'meal_' + Date.now() + Math.random();
                bestRest.timeSpent = 60; // 1 hr for meal
                bestRest.isMeal = true;
                result.push(bestRest);
                lunchAdded = true;
                
                m += 60 + getTravelTime(prevLoc, bestRest, mode);
                h += Math.floor(m / 60);
                m %= 60;
            }
        }
        
        // Check for Dinner (around 17:00 - 20:00)
        if ((mealsChoice === 'dinner' || mealsChoice === 'both') && !dinnerAdded && h >= 17 && h < 20) {
            const prevLoc = result.length > 0 ? result[result.length - 1] : (startCoords || place);
            const currentMin = h * 60 + m;
            const bestRest = findClosest(restaurants, prevLoc, result, currentMin);
            if (bestRest) {
                bestRest.id = 'meal_' + Date.now() + Math.random();
                bestRest.timeSpent = 60;
                bestRest.isMeal = true;
                result.push(bestRest);
                dinnerAdded = true;
                
                m += 60 + getTravelTime(prevLoc, bestRest, mode);
                h += Math.floor(m / 60);
                m %= 60;
            }
        }
        
        result.push(place);
        
        const nextLoc = (i + 1 < itinerary.length) ? itinerary[i+1] : place;
        m += place.timeSpent + getTravelTime(place, nextLoc, mode);
        h += Math.floor(m / 60);
        m %= 60;
    }
    
    // If lunch/dinner wasn't added because time ended early, append it if requested
    if ((mealsChoice === 'lunch' || mealsChoice === 'both') && !lunchAdded) {
        const prevLoc = result.length > 0 ? result[result.length - 1] : (startCoords || {lat:16.43, lng:102.83});
        const bestRest = findClosest(restaurants, prevLoc, result);
        if (bestRest) {
            bestRest.id = 'meal_' + Date.now() + Math.random();
            bestRest.timeSpent = 60;
            bestRest.isMeal = true;
            result.push(bestRest);
        }
    }
    if ((mealsChoice === 'dinner' || mealsChoice === 'both') && !dinnerAdded) {
        const prevLoc = result.length > 0 ? result[result.length - 1] : (startCoords || {lat:16.43, lng:102.83});
        const bestRest = findClosest(restaurants, prevLoc, result);
        if (bestRest) {
            bestRest.id = 'meal_' + Date.now() + Math.random();
            bestRest.timeSpent = 60;
            bestRest.isMeal = true;
            result.push(bestRest);
        }
    }
    
    return result;
}

// Start Trip Navigation
window.startTripNavigation = function() {
    if (!currentItinerary || currentItinerary.length === 0) {
        alert('กรุณาสร้างแผนการท่องเที่ยวให้เรียบร้อยก่อนเริ่มต้นการเดินทาง');
        return;
    }
    
    if (typeof TripNavigator !== 'undefined') {
        TripNavigator.start({
            itinerary: currentItinerary,
            startCoords: startCoords,
            endCoords: endCoords,
            map: map,
            endName: document.getElementById('end-location') ? document.getElementById('end-location').value : 'จุดสิ้นสุด'
        });
    } else {
        alert('ระบบนำทางยังไม่พร้อมใช้งาน กรุณารีเฟรชหน้าเว็บ');
    }
};

// ============================================================
// ===== MULTI-DAY TRIP SYSTEM =====
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

function initMultiDayTrip() {
    const todayStr = toLocalDateString(new Date());
    tripDays = [{ date: todayStr, startTime: '09:00', endTime: '18:00', itinerary: [], generatedPlans: [] }];
    activeDayIndex = 0;
    renderDayTabs();
    syncDayFormToUI();
}

function initMultiDayTrip() {
    const todayStr = toLocalDateString(new Date());
    const initialCats = Array.from(document.querySelectorAll('input[name="category"]:checked')).map(cb => cb.value);
    tripDays = [{
        date: todayStr,
        startTime: '09:00',
        endTime: '18:00',
        categories: initialCats.length > 0 ? initialCats : ['วัด/สถานที่ศักดิ์สิทธิ์', 'ธรรมชาติ', 'คาเฟ่/ถ่ายรูป', 'ตลาด/ช้อปปิ้ง', 'พิพิธภัณฑ์', 'ธรรมชาติ/สวนสัตว์'],
        meals: document.getElementById('meals')?.value || 'none',
        placeCount: document.getElementById('place-count')?.value || 'auto',
        travelDistance: document.getElementById('travel-distance')?.value || '50',
        minRating: document.getElementById('min-rating')?.value || '0',
        startLocation: document.getElementById('start-location')?.value || '',
        endLocation: document.getElementById('end-location')?.value || '',
        startCoords: startCoords ? {...startCoords} : null,
        endCoords: endCoords ? {...endCoords} : null,
        itinerary: [],
        generatedPlans: []
    }];
    activeDayIndex = 0;
    renderDayTabs();
    syncDayFormToUI();
}

function saveCurrentDayState() {
    if (!tripDays || !tripDays[activeDayIndex]) return;
    const day = tripDays[activeDayIndex];
    day.startTime = document.getElementById('start-time')?.value || '09:00';
    day.endTime = document.getElementById('end-time')?.value || '18:00';
    day.date = document.getElementById('trip-date')?.value || day.date;

    const checkedCats = Array.from(document.querySelectorAll('input[name="category"]:checked')).map(cb => cb.value);
    if (checkedCats.length > 0) {
        day.categories = checkedCats;
    }

    day.meals = document.getElementById('meals')?.value || 'none';
    day.placeCount = document.getElementById('place-count')?.value || 'auto';
    day.travelDistance = document.getElementById('travel-distance')?.value || '50';
    day.minRating = document.getElementById('min-rating')?.value || '0';
    day.transportMode = document.getElementById('transport-mode')?.value || 'car';
    day.startLocation = document.getElementById('start-location')?.value || '';
    day.endLocation = document.getElementById('end-location')?.value || '';
    day.startCoords = startCoords ? {...startCoords} : null;
    day.endCoords = endCoords ? {...endCoords} : null;

    day.itinerary = currentItinerary ? [...currentItinerary] : [];
    day.generatedPlans = (typeof generatedPlans !== 'undefined' && generatedPlans) ? [...generatedPlans] : [];
    day.currentPlanIndex = typeof currentPlanIndex !== 'undefined' ? currentPlanIndex : 0;
    day.currentRouteCoords = typeof currentRouteCoords !== 'undefined' ? currentRouteCoords : null;
    day.currentRouteIndices = typeof currentRouteIndices !== 'undefined' ? currentRouteIndices : null;
}

async function restoreDayState(index) {
    const day = tripDays[index];
    if (!day) return;

    if (day.itinerary && day.itinerary.length > 0) {
        currentItinerary = [...day.itinerary];
        generatedPlans = day.generatedPlans && day.generatedPlans.length > 0 ? [...day.generatedPlans] : [currentItinerary];
        currentPlanIndex = day.currentPlanIndex || 0;
        currentRouteCoords = day.currentRouteCoords || null;
        currentRouteIndices = day.currentRouteIndices || null;

        document.querySelectorAll('.plan-tab').forEach((tab, i) => {
            tab.classList.toggle('active', i === currentPlanIndex);
        });

        // หากยังไม่ได้คำนวณเวลาเดินทางจริง ให้คำนวณ OSRM
        if (!day.currentRouteCoords || currentItinerary.some(p => p.realTravelMins === undefined)) {
            const listEl = document.getElementById('itinerary-list');
            if (listEl) listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--primary-color);"><i class="fa-solid fa-spinner fa-spin"></i> กำลังคำนวณเวลาเดินทางจริง...</div>';
            try {
                await updateScheduleWithRealTimes(true);
                day.itinerary = currentItinerary;
                day.currentRouteCoords = currentRouteCoords;
                day.currentRouteIndices = currentRouteIndices;
            } catch (err) {
                console.error("Route calculation error:", err);
            }
        }

        renderItineraryList();
        updateSummary();
        updateMap();
    } else {
        currentItinerary = [];
        generatedPlans = [];
        currentPlanIndex = 0;
        currentRouteCoords = null;
        currentRouteIndices = null;

        const list = document.getElementById('itinerary-list');
        if (list) {
            list.innerHTML = `
                <div style="padding: 2.5rem 1.25rem; text-align: center; color: var(--text-muted);">
                    <i class="fa-solid fa-calendar-plus" style="font-size: 2.5rem; color: var(--primary-color); opacity: 0.7; margin-bottom: 0.75rem; display: block;"></i>
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--text-color); font-weight: 600;">ยังไม่มีแผนสำหรับวันที่ ${index + 1}</h4>
                    <p style="margin: 0 0 1.25rem 0; font-size: 0.88rem; line-height: 1.5;">กำหนดเวลาและสถานที่ แล้วกด <strong>"สร้างแผนการท่องเที่ยว"</strong></p>
                    <button type="button" class="btn btn-primary" onclick="resetForm()" style="margin: 0 auto; display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.88rem;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> ไปสร้างแผนวันที่ ${index + 1}
                    </button>
                </div>
            `;
        }
        updateSummary();
        updateMap();
    }
}

window.addTripDay = function() {
    if (tripDays.length >= MAX_TRIP_DAYS) return;
    saveCurrentDayState();
    const lastDay = tripDays[tripDays.length - 1];
    const lastDate = new Date(lastDay.date + 'T00:00:00');
    lastDate.setDate(lastDate.getDate() + 1);

    // วันใหม่สืบทอดค่าเดิมของวันก่อนหน้าเพื่อให้ผู้ใช้ปรับแต่งต่อได้ง่าย
    const newDay = {
        date: toLocalDateString(lastDate),
        startTime: lastDay.startTime || '09:00',
        endTime: lastDay.endTime || '18:00',
        categories: lastDay.categories && lastDay.categories.length > 0 ? [...lastDay.categories] : ['วัด/สถานที่ศักดิ์สิทธิ์', 'ธรรมชาติ', 'คาเฟ่/ถ่ายรูป', 'ตลาด/ช้อปปิ้ง', 'พิพิธภัณฑ์', 'ธรรมชาติ/สวนสัตว์'],
        meals: lastDay.meals || 'none',
        placeCount: lastDay.placeCount || 'auto',
        travelDistance: lastDay.travelDistance || '50',
        minRating: lastDay.minRating || '0',
        transportMode: lastDay.transportMode || 'car',
        startLocation: lastDay.startLocation || '',
        endLocation: lastDay.endLocation || '',
        startCoords: lastDay.startCoords ? {...lastDay.startCoords} : (startCoords ? {...startCoords} : null),
        endCoords: lastDay.endCoords ? {...lastDay.endCoords} : (endCoords ? {...endCoords} : null),
        itinerary: [],
        generatedPlans: []
    };

    tripDays.push(newDay);
    activeDayIndex = tripDays.length - 1;
    renderDayTabs();
    syncDayFormToUI();
    restoreDayState(activeDayIndex);

    // หากอยู่หน้าผลลัพธ์ ให้สลับกลับหน้าฟอร์มเพื่อให้ผู้ใช้ตรวจสอบการตั้งค่าของวันใหม่
    const resultSidebar = document.getElementById('sidebar-result');
    if (resultSidebar && resultSidebar.style.display !== 'none') {
        resetForm();
    }
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
    if (day.endTime) {
        const [eh, em] = day.endTime.split(':');
        const endHourEl = document.getElementById('end-hour');
        const endMinEl = document.getElementById('end-minute');
        if (endHourEl) endHourEl.value = eh;
        if (endMinEl) endMinEl.value = em || '00';
    }

    // sync hidden time inputs
    const sh = document.getElementById('start-hour')?.value || '09';
    const sm2 = document.getElementById('start-minute')?.value || '00';
    const eh = document.getElementById('end-hour')?.value || '18';
    const em2 = document.getElementById('end-minute')?.value || '00';
    const stEl = document.getElementById('start-time');
    const etEl = document.getElementById('end-time');
    if (stEl) stEl.value = `${sh}:${sm2}`;
    if (etEl) etEl.value = `${eh}:${em2}`;

    // sync categories checkboxes
    if (day.categories && Array.isArray(day.categories)) {
        document.querySelectorAll('input[name="category"]').forEach(cb => {
            cb.checked = day.categories.includes(cb.value);
        });
    }

    // sync meals
    if (day.meals && document.getElementById('meals')) {
        document.getElementById('meals').value = day.meals;
    }

    // sync placeCount
    if (day.placeCount && document.getElementById('place-count')) {
        document.getElementById('place-count').value = day.placeCount;
    }

    // sync travel distance
    if (day.travelDistance && document.getElementById('travel-distance')) {
        const distEl = document.getElementById('travel-distance');
        distEl.value = day.travelDistance;
        const valEl = document.getElementById('travel-distance-val');
        if (valEl) {
            valEl.textContent = parseInt(day.travelDistance) >= 50 ? 'ไม่จำกัด' : `${day.travelDistance} กม.`;
        }
    }

    // sync minRating
    if (day.minRating !== undefined && document.getElementById('min-rating')) {
        document.getElementById('min-rating').value = day.minRating;
    }

    // sync start & end locations
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
    const containers = [
        document.getElementById('dayTabsContainer'),
        document.getElementById('resultDayTabsContainer')
    ].filter(Boolean);

    const resultWrapper = document.getElementById('resultDayTabsWrapper');
    if (resultWrapper) {
        resultWrapper.style.display = tripDays.length > 1 ? 'block' : 'none';
    }

    containers.forEach(container => {
        container.innerHTML = '';
        tripDays.forEach((day, i) => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'day-tab-pill' + (i === activeDayIndex ? ' active' : '');
            const dayName = getDayNameFromDateStr(day.date);
            const dateParts = day.date.split('-');
            const displayDate = dateParts.length === 3 ? `${parseInt(dateParts[2])}/${parseInt(dateParts[1])}` : day.date;
            const hasPlan = day.itinerary && day.itinerary.length > 0;
            const planBadge = hasPlan ? '<span style="width:6px; height:6px; border-radius:50%; background:#10B981; display:inline-block; margin-left:4px;" title="มีแผนแล้ว"></span>' : '';

            pill.innerHTML = `<i class="fa-solid fa-calendar-day"></i> วัน ${i + 1} <span style="opacity:0.85;font-weight:400;">(${dayName} ${displayDate})</span>${planBadge}`;
            pill.onclick = () => window.switchActiveDay(i);
            container.appendChild(pill);
        });
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

function getDayOfWeekFromDateStr(dateStr) {
    if (!dateStr) return new Date().getDay();
    const parts = dateStr.split('-');
    if (parts.length !== 3) return new Date().getDay();
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.getDay();
}

function getActiveDayOfWeek() {
    const day = tripDays[activeDayIndex];
    if (!day || !day.date) return new Date().getDay();
    return getDayOfWeekFromDateStr(day.date);
}

function isPlaceOpenOnSpecificDay(place, dayOfWeek) {
    const openDays = place.open_days || '0,1,2,3,4,5,6';
    if (!openDays || openDays.trim() === '') return true;
    const openDaysList = openDays.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
    if (openDaysList.length >= 7) return true;
    return openDaysList.includes(dayOfWeek);
}

// ตรวจสอบว่าสถานที่เปิดในวันที่ท่องเที่ยวที่เลือกหรือไม่
function isPlaceOpenOnTripDay(place, dayIndex = activeDayIndex) {
    const day = tripDays && tripDays[dayIndex] ? tripDays[dayIndex] : null;
    const dow = day && day.date ? getDayOfWeekFromDateStr(day.date) : getActiveDayOfWeek();
    return isPlaceOpenOnSpecificDay(place, dow);
}
