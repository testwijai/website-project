/**
 * Trip Sequential Navigation Module - Turn-by-Turn Edition
 * Real-time navigation with OSRM step-by-step instructions.
 */

window.TripNavigator = (function () {

    let state = {
        isActive: false, steps: [], currentIndex: 0,
        watchId: null, userLocation: null, userMarker: null, map: null,
        totalDistanceKm: 0, totalTimeMinutes: 0,
        navSteps: [], maneuverIdx: 0, fetchingSteps: false,
        routeBearing: null,      // bearing ของเส้นทางข้างหน้า (มุมที่ map จะหันไป)
        mapBearing: 0,           // มุมการหมุนปัจจุบันของแผนที่ (องศา)
        userHeading: null,       // ทิศทางเข็มทิศที่ตัวเครื่อง/ผู้ใช้หันจริง (0-360 deg)
        compassHandler: null,    // DeviceOrientation listener
        lastHeading: null,       // for smoothing compass
        markerVisualAngle: 0,    // cumulative visual angle สำหรับลูกศรบนหน้าจอ
        hasCompass: false,       // flag ตรวจจับ sensor เข็มทิศ
        // ── Camera State Machine & 3D Navigation ──
        cameraState: 'FOLLOWING', // 'FOLLOWING' หรือ 'USER_INTERACTED'
        isProgrammaticMove: false,// ป้องกัน map event loop เมื่อ script สั่ง pan/bearing
        isPerspective3D: true,    // สถานะมุมมอง 3D
        interactionListenersAttached: false,
        // ── Route Trimming (Google Maps style) ──
        routeCoords: [],         // พิกัดทั้งหมดของเส้นทาง OSRM [{ lat, lng }, ...]
        routePassedIdx: 0,       // index ของจุดสุดท้ายที่ผ่านมาแล้ว
        navPolylineAhead: null,  // Leaflet Polyline เส้นทางข้างหน้า (สีสด)
        navPolylinePassed: null  // Leaflet Polyline เส้นที่ผ่านแล้ว (สีจาง)
    };

    function calcDistKm(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
        const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    function formatDist(km) {
        if (km == null) return '--';
        return km < 1 ? Math.round(km * 1000) + ' \u0e21.' : km.toFixed(1) + ' \u0e01\u0e21.';
    }
    function fmtM(m) {
        if (!m && m !== 0) return '';
        return m < 1000 ? (Math.round(m / 10) * 10) + ' \u0e21.' : (m / 1000).toFixed(1) + ' \u0e01\u0e21.';
    }

    // คำนวณ bearing (0-360°) จากจุด A ไปยังจุด B
    function calcBearing(lat1, lng1, lat2, lng2) {
        const dLon = (lng2 - lng1) * Math.PI / 180;
        const lat1r = lat1 * Math.PI / 180;
        const lat2r = lat2 * Math.PI / 180;
        const y = Math.sin(dLon) * Math.cos(lat2r);
        const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    // ดึง bearing ของเส้นทางข้างหน้า
    // 1. คำนวณจากแนวโค้งของเส้นทางข้างหน้าจริง (Polyline ahead) ระยะ 15-35 เมตร เพื่อให้หมุนตามโค้งถนนแบบ Google Maps
    // 2. Fallback: จุด maneuver ถัดไป
    // 3. Fallback: คำนวณตรงไปยังพิกัดปลายทาง
    function getRouteBearing(currentLat, currentLng) {
        if (state.routeCoords && state.routeCoords.length > 0) {
            const startIdx = state.routePassedIdx || 0;
            const targetIdx = Math.min(state.routeCoords.length - 1, startIdx + 4);
            if (targetIdx > startIdx) {
                const target = state.routeCoords[targetIdx];
                const dist = calcDistKm(currentLat, currentLng, target.lat, target.lng) * 1000;
                if (dist >= 6) {
                    return calcBearing(currentLat, currentLng, target.lat, target.lng);
                }
            }
        }
        if (state.navSteps.length > 0) {
            const idx = Math.min(state.maneuverIdx, state.navSteps.length - 1);
            const step = state.navSteps[idx];

            if (step?.maneuver?.location) {
                const [mLng, mLat] = step.maneuver.location;
                const dist = calcDistKm(currentLat, currentLng, mLat, mLng) * 1000;
                if (dist > 5) {
                    return calcBearing(currentLat, currentLng, mLat, mLng);
                }
            }
            if (step?.maneuver?.bearing_after !== undefined) {
                return step.maneuver.bearing_after;
            }
        }
        // Fallback: ทิศทางไปยังจุดหมายปลายทาง
        const dest = state.steps[state.currentIndex];
        if (dest && dest.lat && dest.lng && currentLat && currentLng) {
            return calcBearing(currentLat, currentLng, dest.lat, dest.lng);
        }
        return null;
    }

    // ── 3D Perspective Mode Controller ──
    function enable3DMode(enable = true) {
        state.isPerspective3D = enable;
        const mapArea = document.querySelector('.map-area');
        const mapEl = document.getElementById('map');
        if (enable) {
            if (mapArea) mapArea.classList.add('nav-3d');
            if (mapEl) mapEl.classList.add('nav-3d');
        } else {
            if (mapArea) mapArea.classList.remove('nav-3d');
            if (mapEl) {
                mapEl.classList.remove('nav-3d');
                mapEl.style.transform = '';
                mapEl.style.transition = '';
            }
        }
        if (state.map) {
            setTimeout(() => { try { state.map.invalidateSize(); } catch(e) {} }, 300);
        }
    }

    // ── Camera State Machine Controller ──
    function setCameraState(newState) {
        state.cameraState = newState;
        const recenterBtn = document.getElementById('nav-recenter-btn');
        if (recenterBtn) {
            if (newState === 'USER_INTERACTED') {
                recenterBtn.classList.add('visible');
            } else {
                recenterBtn.classList.remove('visible');
            }
        }
    }

    // ── Navigation Camera Placement with Bottom-Center Offset ──
    // วางตำแหน่งผู้ใช้ให้อยู่บริเวณด้านล่าง (ประมาณ 72% ของความสูงหน้าจอ)
    // เพื่อให้ทิศทางข้างหน้ามองเห็นถนนได้ไกลและซูมระดับ 18 ชัดเจนระดับถนนแบบ Google Maps
    function setNavigationCamera(lat, lng, zoom = 18, animated = true) {
        if (!state.map || !lat || !lng) return;
        if (state.cameraState !== 'FOLLOWING') return;

        state.isProgrammaticMove = true;
        try {
            const size = state.map.getSize();
            if (!size || size.y === 0) {
                state.map.setView([lat, lng], zoom, { animate: animated });
                return;
            }

            const currentZoom = state.map.getZoom();
            // หากระดับ Zoom ปัจจุบันยังห่างจาก Zoom นำทาง ให้ปรับมาที่ Zoom 18 พร้อมจัด offset ทันที
            if (currentZoom !== zoom) {
                state.map.setView([lat, lng], zoom, { animate: false });
                const offsetPt = L.point(size.x / 2, size.y * 0.48);
                const offsetLatLng = state.map.containerPointToLatLng(offsetPt);
                state.map.setView(offsetLatLng, zoom, { animate: animated, duration: 0.5 });
                return;
            }

            // เมื่ออยู่ที่ Zoom 18 แล้ว เลื่อนกล้องตามตำแหน่งผู้ใช้อย่างนุ่มนวล (52% ความสูงหน้าจอ อยู่เหนือการ์ดอย่างชัดเจน ไม่โดนบัง)
            const targetY = size.y * 0.52;
            const currentCenterPt = L.point(size.x / 2, size.y / 2);
            const userPt = state.map.latLngToContainerPoint([lat, lng]);
            const targetUserPt = L.point(size.x / 2, targetY);

            const shift = userPt.subtract(targetUserPt);
            const newCenterPt = currentCenterPt.add(shift);
            const newCenterLatLng = state.map.containerPointToLatLng(newCenterPt);

            if (animated) {
                state.map.panTo(newCenterLatLng, { animate: true, duration: 0.45, easeLinearity: 0.3 });
            } else {
                state.map.setView(newCenterLatLng, zoom, { animate: false });
            }
        } catch (e) {
            try { state.map.setView([lat, lng], zoom); } catch(err) {}
        } finally {
            setTimeout(() => { state.isProgrammaticMove = false; }, 480);
        }
    }

    // ── Free User Manual Map Interaction Setup ──
    function setupMapInteractionListeners() {
        if (!state.map || state.interactionListenersAttached) return;

        // เปิด gesture หมุนด้วยสองนิ้ว touchRotate ของ leaflet-rotate
        if (state.map.touchRotate && typeof state.map.touchRotate.enable === 'function') {
            state.map.touchRotate.enable();
        }

        const onUserAction = () => {
            if (!state.isActive) return;
            if (state.isProgrammaticMove) return;
            if (state.cameraState === 'USER_INTERACTED') return;
            setCameraState('USER_INTERACTED');
        };

        state.map.on('dragstart', onUserAction);
        state.map.on('rotatestart', onUserAction);
        state.map.on('zoomstart', () => {
            if (!state.isProgrammaticMove) onUserAction();
        });

        const mapEl = document.getElementById('map');
        if (mapEl) {
            mapEl.addEventListener('touchstart', (e) => {
                if (state.isActive && e.touches.length > 1) {
                    onUserAction();
                }
            }, { passive: true });
        }

        state.interactionListenersAttached = true;
    }

    // ── Recenter Action: คืนค่ากล้องสู่โหมดนำทางอัตโนมัติ (ซูมเข้าใกล้ชัดๆ ระดับ 18) ──
    function recenterNavigation() {
        if (!state.isActive || !state.map) return;
        setCameraState('FOLLOWING');
        enable3DMode(true);

        const pos = state.userLocation
            || (typeof startCoords !== 'undefined' && startCoords?.lat ? startCoords : null);
        if (pos && pos.lat && pos.lng) {
            const rb = getRouteBearing(pos.lat, pos.lng);
            if (rb !== null) {
                setMapRouteBearing(rb, true);
            }
            // ซูมเจาะจงระดับ 18 ชัดเจน ไม่ไกลเกินไป
            setNavigationCamera(pos.lat, pos.lng, 18, true);
        }
    }


    function getManeuverInfo(type, modifier) {
        const m = (modifier || '').toLowerCase(), t = (type || '').toLowerCase();
        const icons = {
            // ใช้ FA6 free icons ที่ยืนยันว่ามีใน free tier
            straight: 'fa-arrow-up', left: 'fa-arrow-left', right: 'fa-arrow-right',
            'slight left': 'fa-arrow-left', 'slight right': 'fa-arrow-right',
            'sharp left': 'fa-arrow-left', 'sharp right': 'fa-arrow-right',
            uturn: 'fa-arrow-rotate-left', arrive: 'fa-location-dot', depart: 'fa-arrow-up',
            roundabout: 'fa-rotate-right', rotary: 'fa-rotate-right'
        };
        const labels = {
            depart: '\u0e2d\u0e2d\u0e01\u0e40\u0e14\u0e34\u0e19\u0e17\u0e32\u0e07',
            arrive: '\u0e16\u0e36\u0e07\u0e08\u0e38\u0e14\u0e2b\u0e21\u0e32\u0e22',
            straight: '\u0e15\u0e23\u0e07\u0e44\u0e1b',
            left: '\u0e40\u0e25\u0e35\u0e49\u0e22\u0e27\u0e0b\u0e49\u0e32\u0e22',
            right: '\u0e40\u0e25\u0e35\u0e49\u0e22\u0e27\u0e02\u0e27\u0e32',
            'slight left': '\u0e40\u0e25\u0e35\u0e49\u0e22\u0e27\u0e0b\u0e49\u0e32\u0e22\u0e40\u0e25\u0e47\u0e01\u0e19\u0e49\u0e2d\u0e22',
            'slight right': '\u0e40\u0e25\u0e35\u0e49\u0e22\u0e27\u0e02\u0e27\u0e32\u0e40\u0e25\u0e47\u0e01\u0e19\u0e49\u0e2d\u0e22',
            'sharp left': '\u0e40\u0e25\u0e35\u0e49\u0e22\u0e27\u0e0b\u0e49\u0e32\u0e22\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e0a\u0e31\u0e19',
            'sharp right': '\u0e40\u0e25\u0e35\u0e49\u0e22\u0e27\u0e02\u0e27\u0e32\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e0a\u0e31\u0e19',
            uturn: '\u0e01\u0e25\u0e31\u0e1a\u0e23\u0e16',
            roundabout: '\u0e27\u0e19\u0e27\u0e07\u0e40\u0e27\u0e35\u0e22\u0e19',
            rotary: '\u0e27\u0e19\u0e27\u0e07\u0e40\u0e27\u0e35\u0e22\u0e19',
            merge: '\u0e23\u0e27\u0e21\u0e40\u0e2a\u0e49\u0e19\u0e17\u0e32\u0e07',
            fork: m.includes('left') ? '\u0e41\u0e22\u0e01\u0e0b\u0e49\u0e32\u0e22' : '\u0e41\u0e22\u0e01\u0e02\u0e27\u0e32'
        };
        const colors = {
            arrive: 'arrive', uturn: 'uturn', left: 'turn-left', right: 'turn-right',
            'sharp left': 'turn-left', 'sharp right': 'turn-right', roundabout: 'roundabout', rotary: 'roundabout'
        };
        let icon = icons[m] || icons[t] || 'fa-arrow-up';
        let label = labels[m] || labels[t] || '\u0e15\u0e23\u0e07\u0e44\u0e1b';
        let cls = colors[m] || colors[t] || '';
        if (t === 'arrive') { icon = 'fa-location-dot'; cls = 'arrive'; }
        if (t === 'depart' || t === 'continue' || t === 'new name') { icon = 'fa-arrow-up'; label = '\u0e15\u0e23\u0e07\u0e44\u0e1b'; }
        if (t === 'end of road') {
            icon = m.includes('left') ? 'fa-arrow-left' : 'fa-arrow-right';
            label = m.includes('left') ? '\u0e40\u0e25\u0e35\u0e49\u0e22\u0e27\u0e0b\u0e49\u0e32\u0e22' : '\u0e40\u0e25\u0e35\u0e49\u0e22\u0e27\u0e02\u0e27\u0e32';
        }
        return { icon: 'fa-solid ' + icon, label, colorClass: cls };
    }

    // ซ่อน loading overlay ด้วย fade-out
    function dismissLoadingOverlay() {
        const lo = document.getElementById('nav-loading-overlay');
        if (!lo || lo.classList.contains('nav-loading-dismissed')) return;
        lo.classList.add('nav-loading-dismissed');
        setTimeout(() => { if (lo.parentNode) lo.style.display = 'none'; }, 650);
    }

    // ── Geoapify Routing API (Primary - Driving mode avoiding pedestrian paths) ──
    const GEOAPIFY_API_KEY = '66ebddfc6486404f8155f26ad646927d';

    async function fetchNavGeoapify(fromLat, fromLng, toLat, toLng) {
        if (!GEOAPIFY_API_KEY) return null;
        const url = `https://api.geoapify.com/v1/routing?waypoints=${fromLat},${fromLng}|${toLat},${toLng}&mode=drive&details=instruction_details&format=geojson&apiKey=${GEOAPIFY_API_KEY}`;
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) return null;
            const data = await res.json();
            const feat = data.features?.[0];
            if (!feat || !feat.properties?.legs?.[0]) return null;

            const leg = feat.properties.legs[0];
            const geomCoords = feat.geometry.type === 'MultiLineString'
                ? feat.geometry.coordinates.flat(1)
                : feat.geometry.coordinates;

            const steps = leg.steps.map(s => {
                const fromIdx = s.from_index || 0;
                const startPt = geomCoords[fromIdx] || geomCoords[0] || [fromLng, fromLat];
                const nextPt = geomCoords[Math.min(fromIdx + 1, geomCoords.length - 1)] || startPt;
                let bearing = 0;
                if (startPt && nextPt && (startPt[0] !== nextPt[0] || startPt[1] !== nextPt[1])) {
                    bearing = calcBearing(startPt[1], startPt[0], nextPt[1], nextPt[0]);
                }

                const t = s.instruction?.type || '';
                let mType = 'turn', mMod = 'straight';
                if (t === 'StartAt') { mType = 'depart'; mMod = 'straight'; }
                else if (t === 'Straight') { mType = 'continue'; mMod = 'straight'; }
                else if (t === 'Right') { mType = 'turn'; mMod = 'right'; }
                else if (t === 'Left') { mType = 'turn'; mMod = 'left'; }
                else if (t === 'SlightRight') { mType = 'turn'; mMod = 'slight right'; }
                else if (t === 'SlightLeft') { mType = 'turn'; mMod = 'slight left'; }
                else if (t === 'SharpRight') { mType = 'turn'; mMod = 'sharp right'; }
                else if (t === 'SharpLeft') { mType = 'turn'; mMod = 'sharp left'; }
                else if (t === 'UturnLeft' || t === 'UturnRight') { mType = 'turn'; mMod = 'uturn'; }
                else if (t.startsWith('Roundabout')) { mType = 'roundabout'; mMod = 'roundabout'; }
                else if (t.startsWith('DestinationReached')) { mType = 'arrive'; mMod = 'arrive'; }
                else if (t === 'KeepRight') { mType = 'fork'; mMod = 'right'; }
                else if (t === 'KeepLeft') { mType = 'fork'; mMod = 'left'; }

                const street = s.instruction?.streets?.[0] || '';

                return {
                    distance: s.distance,
                    duration: s.time,
                    name: street,
                    maneuver: {
                        type: mType,
                        modifier: mMod,
                        location: [startPt[0], startPt[1]],
                        bearing_after: Math.round(bearing)
                    }
                };
            });

            return {
                code: 'Ok',
                routes: [{
                    distance: feat.properties.distance,
                    duration: feat.properties.time,
                    geometry: {
                        coordinates: geomCoords
                    },
                    legs: [{
                        distance: leg.distance,
                        duration: leg.time,
                        steps: steps
                    }]
                }]
            };
        } catch (err) {
            console.warn('Geoapify Nav fetch failed, will fallback to OSRM:', err.message);
            return null;
        }
    }

    // ── OSRM servers fallback สำหรับ turn-by-turn navigation ──
    const _NAV_OSRM_SERVERS = [
        { base: 'https://router.project-osrm.org', prefix: '' },
        { base: 'https://routing.openstreetmap.de', prefix: '/routed-car' }
    ];
    let _navOsrmIdx = 0;

    async function fetchNavOSRM(path, retries = 2) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            const srv = _NAV_OSRM_SERVERS[_navOsrmIdx % _NAV_OSRM_SERVERS.length];
            const fullUrl = srv.base + srv.prefix + path;
            try {
                const res = await fetch(fullUrl, { signal: AbortSignal.timeout(10000) });
                if (res.ok) return res;
                if (res.status === 429) { _navOsrmIdx++; await new Promise(r => setTimeout(r, 800)); continue; }
                if (res.status === 400) return null;
            } catch (err) {
                console.warn(`Nav OSRM ${srv.base} failed:`, err.message);
                _navOsrmIdx++;
                if (attempt < retries) await new Promise(r => setTimeout(r, 400));
            }
        }
        return null;
    }

    async function fetchNavSteps() {
        if (state.fetchingSteps) return;
        const dest = state.steps[state.currentIndex];
        if (!dest) return;
        const from = state.userLocation || (typeof startCoords !== 'undefined' ? startCoords : null);
        if (!from) return;
        state.fetchingSteps = true;
        try {
            // First try Geoapify for accurate vehicular driving route
            let data = await fetchNavGeoapify(from.lat, from.lng, dest.lat, dest.lng);
            if (!data) {
                // Fallback to OSRM
                const path = '/route/v1/driving/' +
                    from.lng + ',' + from.lat + ';' + dest.lng + ',' + dest.lat +
                    '?steps=true&geometries=geojson&overview=full&waypoints=0;1';
                const res = await fetchNavOSRM(path);
                if (res) data = await res.json();
            }

            if (!data) { dismissLoadingOverlay(); return; }
            if (data.code === 'Ok' && data.routes?.[0]?.legs?.[0]?.steps) {
                state.navSteps = data.routes[0].legs[0].steps;
                state.maneuverIdx = 0;
                renderManeuver();

                // ── ดึง full geometry มาวาดเส้นนำทางแบบ Google Maps ──
                const geom = data.routes[0].geometry;
                if (geom && geom.coordinates) {
                    state.routeCoords = geom.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
                    state.routePassedIdx = 0;
                    drawNavRoute();
                }

                if (state.userLocation) {
                    const rb = getRouteBearing(state.userLocation.lat, state.userLocation.lng);
                    if (rb !== null) setMapRouteBearing(rb, false);
                    setNavigationCamera(state.userLocation.lat, state.userLocation.lng, 18, false);
                    trimRouteToCurrentPosition(state.userLocation.lat, state.userLocation.lng);
                }
                setTimeout(dismissLoadingOverlay, 350);
            } else {
                dismissLoadingOverlay();
            }
        } catch (e) {
            console.warn('TurnByTurn:', e);
            dismissLoadingOverlay();
        }
        finally { state.fetchingSteps = false; }
    }

    // ── วาดเส้นนำทาง 2 ชั้น: เส้นที่เหลือ (สีสด) + เส้นที่ผ่านแล้ว (สีจาง) ──
    function drawNavRoute() {
        if (!state.map || typeof L === 'undefined' || state.routeCoords.length === 0) return;

        // ลบเส้นเก่าออกก่อน
        if (state.navPolylinePassed && state.map.hasLayer(state.navPolylinePassed)) state.map.removeLayer(state.navPolylinePassed);
        if (state.navPolylineAhead && state.map.hasLayer(state.navPolylineAhead)) state.map.removeLayer(state.navPolylineAhead);

        const passedCoords = state.routeCoords.slice(0, state.routePassedIdx + 1);
        const aheadCoords  = state.routeCoords.slice(state.routePassedIdx);

        // เส้นที่ผ่านมาแล้ว — เทา จาง
        if (passedCoords.length >= 2) {
            state.navPolylinePassed = L.polyline(
                passedCoords.map(c => [c.lat, c.lng]),
                { color: '#94A3B8', weight: 6, opacity: 0.5, lineCap: 'round', lineJoin: 'round' }
            ).addTo(state.map);
        }

        // เส้นข้างหน้า — น้ำเงิน สด
        if (aheadCoords.length >= 2) {
            state.navPolylineAhead = L.polyline(
                aheadCoords.map(c => [c.lat, c.lng]),
                { color: '#3B82F6', weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round' }
            ).addTo(state.map);
            if (state.navPolylineAhead.bringToFront) state.navPolylineAhead.bringToFront();
        }

        // ให้ marker ลูกศรอยู่บนสุดเสมอ
        if (state.userMarker && state.userMarker.bringToFront) state.userMarker.bringToFront();
    }

    // ── ตัดเส้นทางส่วนที่ผ่านมาแล้วออก (เรียกทุกครั้งที่ GPS update) ──
    function trimRouteToCurrentPosition(lat, lng) {
        if (!state.isActive || state.routeCoords.length === 0) return;

        // หาจุดที่ใกล้ที่สุดบนเส้นทาง โดยเริ่มค้นจาก passedIdx เพื่อความเร็ว
        const searchFrom = Math.max(0, state.routePassedIdx - 3);
        const searchTo   = Math.min(state.routeCoords.length - 1, state.routePassedIdx + 60);

        let closestIdx = state.routePassedIdx;
        let minDist = Infinity;
        for (let i = searchFrom; i <= searchTo; i++) {
            const c = state.routeCoords[i];
            const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
            if (d < minDist) { minDist = d; closestIdx = i; }
        }

        // ขยับ passedIdx ไปข้างหน้าเท่านั้น (ไม่ถอยหลัง)
        if (closestIdx > state.routePassedIdx) {
            state.routePassedIdx = closestIdx;
            drawNavRoute();
        }
    }

    // ── ล้างเส้นนำทาง nav route ──
    function clearNavRoute() {
        if (state.navPolylinePassed && state.map && state.map.hasLayer(state.navPolylinePassed)) state.map.removeLayer(state.navPolylinePassed);
        if (state.navPolylineAhead  && state.map && state.map.hasLayer(state.navPolylineAhead))  state.map.removeLayer(state.navPolylineAhead);
        state.navPolylinePassed = null;
        state.navPolylineAhead  = null;
        state.routeCoords  = [];
        state.routePassedIdx = 0;
    }

    function renderManeuver() {
        if (!state.isActive || state.navSteps.length === 0) { showGenericInstruction(); return; }
        const idx = Math.min(state.maneuverIdx, state.navSteps.length - 1);
        const step = state.navSteps[idx];
        const info = getManeuverInfo(step.maneuver.type, step.maneuver.modifier);
        const el = id => document.getElementById(id);
        const bar = document.querySelector('.nav-next-maneuver-bar');

        // คำนวณระยะจริงจาก GPS หรือใช้ค่า OSRM ถ้ายังไม่มี GPS
        let distM = step.distance;
        if (state.userLocation && step.maneuver?.location) {
            const [mLng, mLat] = step.maneuver.location;
            distM = calcDistKm(state.userLocation.lat, state.userLocation.lng, mLat, mLng) * 1000;
        }

        // ── หา next real turn (ข้าม depart/straight/continue) ──
        let nextTurnIdx = idx + 1;
        while (nextTurnIdx < state.navSteps.length) {
            const ns = state.navSteps[nextTurnIdx];
            const ni = getManeuverInfo(ns.maneuver.type, ns.maneuver.modifier);
            const nst = ni.label === 'ตรงไป' || ni.label === 'ออกเดินทาง' ||
                ns.maneuver.type === 'depart' || ns.maneuver.type === 'continue' || ns.maneuver.type === 'new name';
            if (!nst) break;
            nextTurnIdx++;
        }
        const nextTurn = state.navSteps[nextTurnIdx];

        const isStepStraight = info.label === 'ตรงไป' || info.label === 'ออกเดินทาง' ||
            step.maneuver.type === 'depart' || step.maneuver.type === 'continue' || step.maneuver.type === 'new name';

        if (isStepStraight || distM > 50) {
            // ตรงไป → ใช้ระยะถึง next turn จริง
            let distToTurn = distM;
            if (isStepStraight && nextTurn?.maneuver?.location && state.userLocation) {
                const [ntLng, ntLat] = nextTurn.maneuver.location;
                distToTurn = calcDistKm(state.userLocation.lat, state.userLocation.lng, ntLat, ntLng) * 1000;
            }
            const box = el('nav-maneuver-icon-box'), icn = el('nav-maneuver-icon-i');
            if (box) box.className = 'nav-maneuver-icon-box';
            if (icn) icn.className = 'fa-solid fa-arrow-up';
            if (el('nav-maneuver-distance')) el('nav-maneuver-distance').textContent = 'ตรงไป ' + fmtM(distToTurn);
            if (el('nav-maneuver-action')) el('nav-maneuver-action').textContent = '';
            if (el('nav-maneuver-street')) el('nav-maneuver-street').textContent = step.name ? 'บน ' + step.name : '';
            if (nextTurn && bar) {
                const ni = getManeuverInfo(nextTurn.maneuver.type, nextTurn.maneuver.modifier);
                const ni2 = el('nav-next-bar-icon-i');
                if (ni2) ni2.className = ni.icon;
                if (el('nav-next-bar-text')) el('nav-next-bar-text').textContent = ni.label + ' ใน ' + fmtM(distToTurn);
                bar.style.display = 'flex';
            } else if (bar) { bar.style.display = 'none'; }
        } else {
            // ใกล้จุดเลี้ยว ≤ 50ม. → icon เลี้ยว
            const box = el('nav-maneuver-icon-box'), icn = el('nav-maneuver-icon-i');
            if (box) box.className = 'nav-maneuver-icon-box ' + info.colorClass;
            if (icn) icn.className = info.icon;
            if (el('nav-maneuver-distance')) el('nav-maneuver-distance').textContent = 'อีก ' + fmtM(distM);
            if (el('nav-maneuver-action')) el('nav-maneuver-action').textContent = info.label;
            if (el('nav-maneuver-street')) el('nav-maneuver-street').textContent = step.name ? 'บน ' + step.name : '';
            if (nextTurn && bar) {
                const ni = getManeuverInfo(nextTurn.maneuver.type, nextTurn.maneuver.modifier);
                const ni2 = el('nav-next-bar-icon-i');
                if (ni2) ni2.className = ni.icon;
                if (el('nav-next-bar-text')) el('nav-next-bar-text').textContent = ni.label + ' ใน ' + fmtM(nextTurn.distance);
                bar.style.display = 'flex';
            } else if (bar) { bar.style.display = 'none'; }
        }
    }


    function showGenericInstruction() {
        const dest = state.steps[state.currentIndex];
        const el = id => document.getElementById(id);
        const box = el('nav-maneuver-icon-box');
        if (box) box.className = 'nav-maneuver-icon-box';
        const icn = el('nav-maneuver-icon-i');
        if (icn) icn.className = 'fa-solid fa-arrow-up';
        if (el('nav-maneuver-distance')) el('nav-maneuver-distance').textContent =
            (dest && state.userLocation)
                ? '\u0e2d\u0e35\u0e01 ' + formatDist(calcDistKm(state.userLocation.lat, state.userLocation.lng, dest.lat, dest.lng))
                : '\u0e01\u0e33\u0e25\u0e31\u0e07\u0e42\u0e2b\u0e25\u0e14...';
        if (el('nav-maneuver-action')) el('nav-maneuver-action').textContent = '\u0e21\u0e38\u0e48\u0e07\u0e2b\u0e19\u0e49\u0e32\u0e44\u0e1b';
        if (el('nav-maneuver-street')) el('nav-maneuver-street').textContent = dest ? dest.name : '';
        const bar = document.querySelector('.nav-next-maneuver-bar');
        if (bar) bar.style.display = 'none';
    }

    function advanceManeuverIfNeeded() {
        if (!state.userLocation || state.navSteps.length === 0) return;

        const step = state.navSteps[state.maneuverIdx];
        if (!step?.maneuver?.location) return;
        const [lng, lat] = step.maneuver.location;
        const distM = calcDistKm(state.userLocation.lat, state.userLocation.lng, lat, lng) * 1000;

        const el = id => document.getElementById(id);
        const bar = document.querySelector('.nav-next-maneuver-bar');
        const info = getManeuverInfo(step.maneuver.type, step.maneuver.modifier);
        const isStraight = info.label === 'ตรงไป' || info.label === 'ออกเดินทาง' ||
            step.maneuver.type === 'depart' || step.maneuver.type === 'continue' || step.maneuver.type === 'new name';

        // ── หา next real turn maneuver (ข้าม straight steps) ──
        let nextTurnIdx = state.maneuverIdx + 1;
        while (nextTurnIdx < state.navSteps.length) {
            const ns = state.navSteps[nextTurnIdx];
            const ni = getManeuverInfo(ns.maneuver.type, ns.maneuver.modifier);
            const nst = ni.label === 'ตรงไป' || ni.label === 'ออกเดินทาง' || ns.maneuver.type === 'depart' || ns.maneuver.type === 'continue' || ns.maneuver.type === 'new name';
            if (!nst) break;
            nextTurnIdx++;
        }
        const nextTurn = state.navSteps[nextTurnIdx];

        if (isStraight) {
            // Step ปัจจุบันคือตรงไป → หาระยะถึง next turn แล้วแสดง
            let distToTurn = distM; // fallback: ระยะถึง step ปัจจุบัน
            if (nextTurn?.maneuver?.location) {
                const [ntLng, ntLat] = nextTurn.maneuver.location;
                distToTurn = calcDistKm(state.userLocation.lat, state.userLocation.lng, ntLat, ntLng) * 1000;
            }
            const box = el('nav-maneuver-icon-box'), icn = el('nav-maneuver-icon-i');
            if (box) box.className = 'nav-maneuver-icon-box';
            if (icn) icn.className = 'fa-solid fa-arrow-up';
            if (el('nav-maneuver-distance')) el('nav-maneuver-distance').textContent = 'ตรงไป ' + fmtM(distToTurn);
            if (el('nav-maneuver-action')) el('nav-maneuver-action').textContent = '';
            if (el('nav-maneuver-street')) el('nav-maneuver-street').textContent = step.name ? 'บน ' + step.name : '';
            // แสดง next turn bar
            if (nextTurn && bar) {
                const ni = getManeuverInfo(nextTurn.maneuver.type, nextTurn.maneuver.modifier);
                const ni2 = el('nav-next-bar-icon-i');
                if (ni2) ni2.className = ni.icon;
                if (el('nav-next-bar-text')) el('nav-next-bar-text').textContent = ni.label + ' ใน ' + fmtM(distToTurn);
                bar.style.display = 'flex';
            } else if (bar) { bar.style.display = 'none'; }
        } else if (distM > 50) {
            // ยังไกลจุดเลี้ยวอยู่ → แสดง "ตรงไป X ม." ไปก่อน
            const box = el('nav-maneuver-icon-box'), icn = el('nav-maneuver-icon-i');
            if (box) box.className = 'nav-maneuver-icon-box';
            if (icn) icn.className = 'fa-solid fa-arrow-up';
            if (el('nav-maneuver-distance')) el('nav-maneuver-distance').textContent = 'ตรงไป ' + fmtM(distM);
            if (el('nav-maneuver-action')) el('nav-maneuver-action').textContent = '';
            if (el('nav-maneuver-street')) el('nav-maneuver-street').textContent = step.name ? 'บน ' + step.name : '';
            if (nextTurn && bar) {
                const ni = getManeuverInfo(nextTurn.maneuver.type, nextTurn.maneuver.modifier);
                const ni2 = el('nav-next-bar-icon-i');
                if (ni2) ni2.className = ni.icon;
                if (el('nav-next-bar-text')) el('nav-next-bar-text').textContent = ni.label + ' ใน ' + fmtM(distM);
                bar.style.display = 'flex';
            } else if (bar) { bar.style.display = 'none'; }
        } else {
            // ใกล้จุดเลี้ยว ≤ 50ม. → icon เลี้ยว + "อีก X ม."
            const box = el('nav-maneuver-icon-box'), icn = el('nav-maneuver-icon-i');
            if (box) box.className = 'nav-maneuver-icon-box ' + info.colorClass;
            if (icn) icn.className = info.icon;
            if (el('nav-maneuver-distance')) el('nav-maneuver-distance').textContent = 'อีก ' + fmtM(distM);
            if (el('nav-maneuver-action')) el('nav-maneuver-action').textContent = info.label;
            if (el('nav-maneuver-street')) el('nav-maneuver-street').textContent = step.name ? 'บน ' + step.name : '';
            if (nextTurn && bar) {
                const ni = getManeuverInfo(nextTurn.maneuver.type, nextTurn.maneuver.modifier);
                const ni2 = el('nav-next-bar-icon-i');
                if (ni2) ni2.className = ni.icon;
                if (el('nav-next-bar-text')) el('nav-next-bar-text').textContent = ni.label + ' ใน ' + fmtM(nextTurn.distance);
                bar.style.display = 'flex';
            } else if (bar) { bar.style.display = 'none'; }
        }

        // ถึงจุด maneuver < 15ม. → ข้ามไป step ถัดไป
        // ยกเว้น depart เพราะ depart point = จุดที่ยืนอยู่ตอนเริ่ม (distM ≈ 0 ทันที)
        const isDepart = step.maneuver.type === 'depart';
        if (distM < 15 && !isDepart && state.maneuverIdx < state.navSteps.length - 1) {
            state.maneuverIdx++;
            renderManeuver();
            // ถึงจุดเลี้ยว/เปลี่ยน maneuver → หมุนมุมมองแผนที่ตามเส้นทางข้างหน้าทันที
            const currentPos = state.userLocation
                || (typeof startCoords !== 'undefined' && startCoords?.lat ? startCoords : null);
            if (currentPos) {
                const newBearing = getRouteBearing(currentPos.lat, currentPos.lng);
                if (newBearing !== null) {
                    setMapRouteBearing(newBearing, true);
                }
            }
        }

    }


    function ensureNavigationDOM() {
        if (document.getElementById('trip-navigation-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'trip-navigation-overlay';
        overlay.innerHTML =
            '<div class="nav-top-section">' +
            '<div class="nav-instruction-banner">' +
            '<div class="nav-maneuver-icon-box" id="nav-maneuver-icon-box"><i class="fa-solid fa-arrow-up" id="nav-maneuver-icon-i"></i></div>' +
            '<div class="nav-maneuver-info">' +
            '<div class="nav-maneuver-distance" id="nav-maneuver-distance">\u0e01\u0e33\u0e25\u0e31\u0e07\u0e42\u0e2b\u0e25\u0e14...</div>' +
            '<div class="nav-maneuver-action" id="nav-maneuver-action">\u0e21\u0e38\u0e48\u0e07\u0e2b\u0e19\u0e49\u0e32\u0e44\u0e1b</div>' +
            '<div class="nav-maneuver-street" id="nav-maneuver-street"></div>' +
            '</div>' +
            '<button class="nav-close-top" onclick="TripNavigator.stop()"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<div class="nav-next-maneuver-bar" style="display:none;">' +
            '<span class="then-label">\u0e08\u0e32\u0e01\u0e19\u0e31\u0e49\u0e19</span>' +
            '<div class="next-icon-box"><i class="fa-solid fa-arrow-up" id="nav-next-bar-icon-i"></i></div>' +
            '<span id="nav-next-bar-text"></span>' +
            '</div>' +
            '</div>' +
            /* Google Maps style Compass needle floating button */
            '<button class="nav-compass-btn" id="nav-compass-btn" onclick="TripNavigator.resetNorth()" title="รีเซ็ตทิศเหนือ">' +
            '<div class="nav-compass-needle" id="nav-compass-needle"></div>' +
            '</button>' +
            /* Google Maps style Recenter button */
            '<button class="nav-recenter-btn" id="nav-recenter-btn" onclick="TripNavigator.recenterNavigation()" title="กลับสู่การนำทาง">' +
            '<i class="fa-solid fa-location-arrow"></i>' +
            '<span>กลับสู่กึ่งกลาง</span>' +
            '</button>' +
            '<div class="nav-card">' +
            '<div class="nav-card-header">' +
            '<div class="nav-step-badge" id="nav-step-badge"><i class="fa-solid fa-location-dot"></i><span id="nav-step-count">\u0e08\u0e38\u0e14\u0e17\u0e35\u0e48 1/4</span></div>' +
            '<h3 class="nav-dest-title" id="nav-dest-title">\u0e0a\u0e37\u0e48\u0e2d\u0e2a\u0e16\u0e32\u0e19\u0e17\u0e35\u0e48</h3>' +
            '<button class="nav-close-btn" onclick="TripNavigator.stop()"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<div class="nav-progress-wrap"><div class="nav-progress-bar" id="nav-progress-bar" style="width:25%;"></div></div>' +
            '<div class="nav-card-actions">' +
            '<button class="nav-btn nav-btn-prev" id="nav-btn-prev" onclick="TripNavigator.prevStep()"><i class="fa-solid fa-chevron-left"></i></button>' +
            '<button class="nav-btn nav-btn-next" id="nav-btn-next" onclick="TripNavigator.nextStep()"><span>\u0e16\u0e36\u0e07\u0e41\u0e25\u0e49\u0e27 / \u0e16\u0e31\u0e14\u0e44\u0e1b</span><i class="fa-solid fa-arrow-right"></i></button>' +
            '</div></div>' +
            /* Loading overlay — covers map until GPS + route bearing ready */
            '<div class="nav-loading-overlay" id="nav-loading-overlay">' +
            '<div class="nav-loading-box">' +
            '<div class="nav-loading-spinner"></div>' +
            '<div class="nav-loading-title">\u0e01\u0e33\u0e25\u0e31\u0e07\u0e23\u0e30\u0e1a\u0e38\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07...</div>' +
            '<div class="nav-loading-sub">\u0e23\u0e2d GPS + \u0e40\u0e2a\u0e49\u0e19\u0e17\u0e32\u0e07</div>' +
            '</div>' +
            '</div>';

        const modal = document.createElement('div');
        modal.id = 'nav-completed-modal'; modal.className = 'nav-completed-modal';
        modal.innerHTML =
            '<div class="nav-completed-box">' +
            '<div class="nav-completed-icon"><i class="fa-solid fa-flag-checkered"></i></div>' +
            '<h2 class="nav-completed-title">\u0e22\u0e34\u0e19\u0e14\u0e35\u0e14\u0e49\u0e27\u0e22! \u0e04\u0e38\u0e13\u0e40\u0e14\u0e34\u0e19\u0e17\u0e32\u0e07\u0e16\u0e36\u0e07\u0e04\u0e23\u0e1a\u0e41\u0e25\u0e49\u0e27</h2>' +
            '<p class="nav-completed-desc">\u0e04\u0e38\u0e13\u0e44\u0e14\u0e49\u0e40\u0e14\u0e34\u0e19\u0e17\u0e32\u0e07\u0e17\u0e48\u0e2d\u0e07\u0e40\u0e17\u0e35\u0e48\u0e22\u0e27\u0e04\u0e23\u0e1a\u0e17\u0e38\u0e01\u0e08\u0e38\u0e14\u0e2b\u0e21\u0e32\u0e22\u0e15\u0e32\u0e21\u0e41\u0e1c\u0e19\u0e40\u0e23\u0e35\u0e22\u0e1a\u0e23\u0e49\u0e2d\u0e22\u0e41\u0e25\u0e49\u0e27</p>' +
            '<div class="nav-completed-stats">' +
            '<div><div class="nav-stat-val" id="nav-stat-places">0</div><div class="nav-stat-lbl">\u0e2a\u0e16\u0e32\u0e19\u0e17\u0e35\u0e48\u0e17\u0e35\u0e48\u0e41\u0e27\u0e30</div></div>' +
            '<div><div class="nav-stat-val" id="nav-stat-distance">--</div><div class="nav-stat-lbl">\u0e23\u0e30\u0e22\u0e30\u0e17\u0e32\u0e07\u0e23\u0e27\u0e21</div></div>' +
            '<div><div class="nav-stat-val" id="nav-stat-time">--</div><div class="nav-stat-lbl">\u0e40\u0e27\u0e25\u0e32\u0e23\u0e27\u0e21</div></div>' +
            '</div>' +
            '<button class="btn btn-primary" style="width:100%;justify-content:center;padding:0.85rem;" onclick="TripNavigator.closeCompletedModal()">' +
            '<i class="fa-solid fa-check"></i> \u0e40\u0e2a\u0e23\u0e47\u0e08\u0e2a\u0e34\u0e49\u0e19\u0e01\u0e32\u0e23\u0e40\u0e14\u0e34\u0e19\u0e17\u0e32\u0e07' +
            '</button></div>';
        const mapEl = document.getElementById('map');
        const parent = mapEl ? mapEl.parentElement : document.body;
        parent.style.position = 'relative';
        parent.appendChild(overlay);
        document.body.appendChild(modal);
    }

    function start(options) {
        if (!options || !options.itinerary || options.itinerary.length === 0) {
            alert('\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e2a\u0e16\u0e32\u0e19\u0e17\u0e35\u0e48'); return;
        }
        ensureNavigationDOM();
        state.map = options.map || (typeof map !== 'undefined' ? map : null);
        state.currentIndex = 0; state.isActive = true;
        state.totalDistanceKm = options.totalDistance || 0; state.totalTimeMinutes = options.totalTime || 0;
        state.navSteps = []; state.maneuverIdx = 0; state.fetchingSteps = false;
        state.steps = options.itinerary.map((p, idx) => ({
            index: idx, name: p.name || '\u0e2a\u0e16\u0e32\u0e19\u0e17\u0e35\u0e48\u0e17\u0e48\u0e2d\u0e07\u0e40\u0e17\u0e35\u0e48\u0e22\u0e27',
            category: p.category || '\u0e17\u0e48\u0e2d\u0e07\u0e40\u0e17\u0e35\u0e48\u0e22\u0e27',
            image: p.image || '', lat: parseFloat(p.lat), lng: parseFloat(p.lng),
            stayTime: p.visitMinutes || p.stay_time || 60,
            arrivalStr: p.arrivalStr || p.estimatedArrival || '--:--',
            realDistKm: p.realDistKm || null, realTravelMins: p.realTravelMins || null, originalData: p
        }));
        if (options.endCoords?.lat) {
            const last = state.steps[state.steps.length - 1];
            if (calcDistKm(last.lat, last.lng, options.endCoords.lat, options.endCoords.lng) > 0.05) {
                state.steps.push({
                    index: state.steps.length,
                    name: options.endName || '\u0e08\u0e38\u0e14\u0e2a\u0e34\u0e49\u0e19\u0e2a\u0e38\u0e14\u0e01\u0e32\u0e23\u0e40\u0e14\u0e34\u0e19\u0e17\u0e32\u0e07',
                    category: '\u0e08\u0e38\u0e14\u0e2a\u0e34\u0e49\u0e19\u0e2a\u0e38\u0e14',
                    image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=300',
                    lat: parseFloat(options.endCoords.lat), lng: parseFloat(options.endCoords.lng),
                    stayTime: 0, arrivalStr: '--:--', isEndLocation: true
                });
            }
        }
        const overlay = document.getElementById('trip-navigation-overlay');
        if (overlay) overlay.style.display = 'flex';
        if (typeof userLiveMarker !== 'undefined' && userLiveMarker && state.map)
            if (state.map.hasLayer(userLiveMarker)) state.map.removeLayer(userLiveMarker);

        // ── เปิด touch rotation ให้หมุนด้วยสองนิ้วได้อย่างอิสระ ──
        if (state.map && state.map.touchRotate && typeof state.map.touchRotate.enable === 'function') {
            state.map.touchRotate.enable();
        }
        if (state.map && state.map.compassBearing && typeof state.map.compassBearing.disable === 'function') {
            state.map.compassBearing.disable();
        }

        // ── เปิด 3D Perspective Mode สไตล์ Google Maps ──
        enable3DMode(true);
        setCameraState('FOLLOWING');
        setupMapInteractionListeners();

        startCompassWatch();

        // ── Instant marker & camera placement: วาง marker ทันทีและจัดกล้องค่อนล่างจอ พร้อมหมุนตามเส้นทาง ──
        const initPos = state.userLocation
            || options.startCoords
            || (typeof startCoords !== 'undefined' && startCoords?.lat ? startCoords : null);
        if (initPos && initPos.lat && initPos.lng) {
            const initBearing = getRouteBearing(initPos.lat, initPos.lng);
            if (initBearing !== null) {
                setMapRouteBearing(initBearing, false);
            }
            updateUserMarker(initPos.lat, initPos.lng);
            if (state.map) {
                state.map.invalidateSize();
                setNavigationCamera(initPos.lat, initPos.lng, 18, false);
            }
        }

        startLocationWatcher();
        if (typeof window.switchMobileView === 'function') window.switchMobileView('map');

        updateStepUI();
        fetchNavSteps();

        // ── Animate camera ไปยังตำแหน่งนำทางหลังเปลี่ยนวิวเสร็จ (350ms) ──
        setTimeout(() => {
            if (!state.map || !state.isActive) return;
            state.map.invalidateSize();
            const pos = state.userLocation
                || options.startCoords
                || (typeof startCoords !== 'undefined' && startCoords?.lat ? startCoords : null);
            if (!pos || !pos.lat || !pos.lng) return;
            const rb = getRouteBearing(pos.lat, pos.lng);
            if (rb !== null) {
                setMapRouteBearing(rb, false);
            }
            updateUserMarker(pos.lat, pos.lng);
            setNavigationCamera(pos.lat, pos.lng, 18, true);
        }, 350);

        // ย้ำการซูมนำทางอีกครั้งหลังจาก layout ของ mobile ปรับขนาดเสร็จสมบูรณ์ (550ms)
        setTimeout(() => {
            if (!state.map || !state.isActive) return;
            state.map.invalidateSize();
            const pos = state.userLocation
                || options.startCoords
                || (typeof startCoords !== 'undefined' && startCoords?.lat ? startCoords : null);
            if (!pos || !pos.lat || !pos.lng) return;
            setNavigationCamera(pos.lat, pos.lng, 18, true);
        }, 550);

        // Safety: ถ้า GPS/network ช้า ซ่อน loading หลัง 8 วิ อยู่ดี
        setTimeout(dismissLoadingOverlay, 8000);

    } // end start()




    function startLocationWatcher() {
        if (!navigator.geolocation) return;

        // ── Quick first fix: ยอมรับ cache ทุก age → ขึ้น marker ทันทีถ้าเคย grant permission แล้ว ──
        navigator.geolocation.getCurrentPosition(
            pos => {
                if (!state.isActive) return;
                const { latitude: lat, longitude: lng, accuracy } = pos.coords;
                state.userLocation = { lat, lng, accuracy };
                const rb = getRouteBearing(lat, lng);
                if (rb !== null) {
                    setMapRouteBearing(rb, false);
                }
                updateUserMarker(lat, lng);
                if (state.map) {
                    setNavigationCamera(lat, lng, 18, true);
                }
                updateLiveDistance();
                if (state.navSteps.length === 0) fetchNavSteps();
            },
            () => {}, // ไม่สนใจ error — watchPosition จะ retry เอง
            { enableHighAccuracy: false, maximumAge: Infinity, timeout: 500 } // grab any cache instantly
        );

        const onPosition = pos => {
            if (!state.isActive) return;
            const { latitude: lat, longitude: lng, accuracy, heading: gpsHeading } = pos.coords;
            state.userLocation = { lat, lng, accuracy };

            // ── อัปเดต Route Bearing: มุมมองแผนที่จะหมุนตามทิศทางของเส้นทางข้างหน้า ──
            const routeBearing = getRouteBearing(lat, lng);
            if (routeBearing !== null) {
                setMapRouteBearing(routeBearing, true);
            }

            // ถ้าไม่มี compass ให้ใช้ GPS heading หรือ routeBearing ชี้ทิศทางลูกศร
            if (!state.hasCompass) {
                if (gpsHeading !== null && !isNaN(gpsHeading) && gpsHeading >= 0) {
                    updateArrowRotation(gpsHeading);
                } else if (routeBearing !== null) {
                    updateArrowRotation(routeBearing);
                }
            }

            updateUserMarker(lat, lng);
            if (state.map) {
                // คงตำแหน่ง marker ไว้ค่อนล่างจอเสมอตามโหมด FOLLOWING
                setNavigationCamera(lat, lng, 18, true);
            }

            // ── Trim เส้นทางส่วนที่ผ่านมาแล้วออก (Google Maps style) ──
            trimRouteToCurrentPosition(lat, lng);

            updateLiveDistance();
            advanceManeuverIfNeeded();
            if (state.navSteps.length === 0) fetchNavSteps();
        };

        const onError = err => console.warn('GPS:', err.message);

        // ── Phase 1: Low-accuracy watch → ได้ fix เร็ว (ภายใน ~1 วิ บน Android) ──
        const lowWatchId = navigator.geolocation.watchPosition(
            pos => {
                onPosition(pos);
                navigator.geolocation.clearWatch(lowWatchId);
                // ── Phase 2: High-accuracy watch → แม่นยำขึ้นต่อเนื่อง ──
                state.watchId = navigator.geolocation.watchPosition(
                    onPosition, onError,
                    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
                );
            },
            onError,
            { enableHighAccuracy: false, maximumAge: 5000, timeout: 5000 }
        );
    }



    /* ─── MAP ROUTE-BEARING ENGINE ─── */
    let mapBearingAnimId = null;

    function setMapRouteBearing(targetDeg, animated = true) {
        if (!state.map || targetDeg === null || isNaN(targetDeg)) return;
        targetDeg = (targetDeg % 360 + 360) % 360;
        state.routeBearing = targetDeg;

        // ถ้าผู้ใช้กำลังควบคุมแผนที่เอง ให้หยุดหมุนแผนที่อัตโนมัติ (แต่ยังอัปเดตลูกศรและเข็มทิศ)
        if (state.cameraState !== 'FOLLOWING') {
            updateArrowRotation();
            const currentB = (typeof state.map.getBearing === 'function') ? state.map.getBearing() : state.mapBearing;
            updateCompassBtn(currentB || 0);
            return;
        }

        if (typeof state.map.setBearing !== 'function') {
            state.mapBearing = targetDeg;
            updateArrowRotation();
            updateCompassBtn(targetDeg);
            return;
        }

        if (!animated) {
            if (mapBearingAnimId) { cancelAnimationFrame(mapBearingAnimId); mapBearingAnimId = null; }
            state.mapBearing = targetDeg;
            state.isProgrammaticMove = true;
            state.map.setBearing(targetDeg);
            setTimeout(() => { state.isProgrammaticMove = false; }, 60);
            updateArrowRotation();
            updateCompassBtn(targetDeg);
            return;
        }

        // คำนวณ shortest rotational path (-180 ถึง 180 องศา)
        const cur = (state.mapBearing % 360 + 360) % 360;
        let diff = (targetDeg - cur) % 360;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        if (Math.abs(diff) < 1.5) return; // ไม่หมุนถ้าเปลี่ยนน้อยกว่า 1.5 องศา

        if (mapBearingAnimId) cancelAnimationFrame(mapBearingAnimId);

        const startBearing = state.mapBearing;
        const duration = 480; // ms
        const startTime = performance.now();

        function frame(now) {
            if (state.cameraState !== 'FOLLOWING') {
                mapBearingAnimId = null;
                return;
            }
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            // easeOutCubic
            const ease = 1 - Math.pow(1 - progress, 3);
            const currentDeg = startBearing + diff * ease;

            state.mapBearing = (currentDeg % 360 + 360) % 360;
            state.isProgrammaticMove = true;
            state.map.setBearing(state.mapBearing);
            updateArrowRotation();
            updateCompassBtn(state.mapBearing);

            if (progress < 1) {
                mapBearingAnimId = requestAnimationFrame(frame);
            } else {
                state.mapBearing = targetDeg;
                state.map.setBearing(targetDeg);
                setTimeout(() => { state.isProgrammaticMove = false; }, 60);
                updateArrowRotation();
                updateCompassBtn(targetDeg);
                mapBearingAnimId = null;
            }
        }

        mapBearingAnimId = requestAnimationFrame(frame);
    }



    /* ─── COMPASS / DEVICE ORIENTATION (หมุนเฉพาะ Marker ไม่หมุนแผนที่) ─── */
    function startCompassWatch() {
        if (state.compassHandler) return; // already watching

        const handler = (e) => {
            if (!state.isActive) return;
            let heading = null;
            // iOS: webkitCompassHeading (0=North, CW positive)
            if (typeof e.webkitCompassHeading === 'number') {
                heading = e.webkitCompassHeading;
            }
            // Android: alpha (0=North, CCW positive)
            else if (e.alpha !== null && e.alpha !== undefined) {
                heading = (360 - e.alpha) % 360;
            }
            if (heading === null || isNaN(heading)) return;

            state.hasCompass = true;

            // Smooth heading with low-pass filter
            if (state.lastHeading !== null) {
                let diff = heading - state.lastHeading;
                if (diff > 180) diff -= 360;
                if (diff < -180) diff += 360;
                heading = (state.lastHeading + diff * 0.35 + 360) % 360;
            }
            state.lastHeading = heading;

            // หมุนเฉพาะลูกศร Marker ตามทิศที่ผู้ใช้หัน (มุมมองแผนที่ล็อคตามเส้นทาง ไม่หมุนตาม marker)
            updateArrowRotation(heading);
        };

        state.compassHandler = handler;
        window.addEventListener('deviceorientationabsolute', handler, true);
        window.addEventListener('deviceorientation', handler, true);

        // Request permission on iOS 13+
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().catch(() => { });
        }
    }

    function stopCompassWatch() {
        if (state.compassHandler) {
            window.removeEventListener('deviceorientationabsolute', state.compassHandler, true);
            window.removeEventListener('deviceorientation', state.compassHandler, true);
            state.compassHandler = null;
        }
        state.hasCompass = false;
        state.userHeading = null;
        state.lastHeading = null;
    }

    function applyHeadingUp(headingDeg) {
        setMapRouteBearing(headingDeg, true);
    }


    function resetMapRotation() {
        if (mapBearingAnimId) { cancelAnimationFrame(mapBearingAnimId); mapBearingAnimId = null; }
        if (state.map && typeof state.map.setBearing === 'function') {
            state.map.setBearing(0);
            state.mapBearing = 0;
        }
        const mapEl = document.getElementById('map');
        if (mapEl) {
            mapEl.style.transform = '';
            mapEl.style.transition = '';
        }
        if (state.map) state.map.invalidateSize();
    }

    function updateArrowRotation(userCompassDeg) {
        if (userCompassDeg !== null && userCompassDeg !== undefined && !isNaN(userCompassDeg)) {
            state.userHeading = userCompassDeg;
        }
        // ทิศทางที่ผู้ใช้หัน: ถ้ามีค่าจากเข็มทิศให้ใช้ userHeading ถ้ายังไม่มีให้ชี้ตรงตามเส้นทาง (routeBearing)
        const heading = state.userHeading !== null ? state.userHeading : (state.routeBearing || 0);
        const mapB = (state.map && typeof state.map.getBearing === 'function') ? state.map.getBearing() : (state.mapBearing || 0);

        // มุมสัมพันธ์กับหน้าจอ: เมื่อหันหน้าไปทิศเดียวกับแผนที่ (heading == mapB) ลูกศรจะชี้ขึ้นตรง (0 deg)
        const targetRelative = (heading - mapB + 360) % 360;

        // คำนวณ shortest path angle สะสม ป้องกันหมุนครบรอบแบบกระตุก
        const currentNorm = (state.markerVisualAngle % 360 + 360) % 360;
        let diff = targetRelative - currentNorm;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        state.markerVisualAngle += diff;

        const inners = document.querySelectorAll('.gmaps-arrow-inner, .nav-arrow-inner');
        inners.forEach(el => {
            el.style.transform = `rotate(${state.markerVisualAngle}deg)`;
        });
    }

    function stopLocationWatcher() {
        if (state.watchId !== null) { navigator.geolocation.clearWatch(state.watchId); state.watchId = null; }
        if (state.userMarker && state.map) { state.map.removeLayer(state.userMarker); state.userMarker = null; }
    }

    function updateUserMarker(lat, lng) {
        if (!state.map || typeof L === 'undefined') return;
        if (!state.userMarker) {
            const rot = state.markerVisualAngle || 0;
            const arrowHtml =
                '<div class="gmaps-nav-marker">' +
                '<div class="gmaps-marker-halo"></div>' +
                '<div class="gmaps-marker-disc">' +
                '<div class="gmaps-arrow-inner" style="transform: rotate(' + rot + 'deg);">' +
                '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M24 6 L42 41 L24 33 L6 41 Z" fill="#1A73E8" stroke="#FFFFFF" stroke-width="2.5" stroke-linejoin="round"/>' +
                '<path d="M24 10 L38 38 L24 32 Z" fill="#4285F4" opacity="0.65"/>' +
                '</svg>' +
                '</div>' +
                '</div>' +
                '</div>';
            const icon = L.divIcon({
                className: '',
                html: arrowHtml,
                iconSize: [52, 52],
                iconAnchor: [26, 26]
            });
            state.userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 })
                .addTo(state.map);
        } else {
            state.userMarker.setLatLng([lat, lng]);
        }
    }

    function updateLiveDistance() {
        const el = document.getElementById('nav-live-distance');
        if (!el) return;
        const dest = state.steps[state.currentIndex];
        if (!dest) return;
        if (state.userLocation) el.textContent = formatDist(calcDistKm(state.userLocation.lat, state.userLocation.lng, dest.lat, dest.lng));
        else if (dest.realDistKm) el.textContent = dest.realDistKm.toFixed(1) + ' \u0e01\u0e21.';
        else el.textContent = '--';
        renderManeuver();
    }

    function updateStepUI() {
        if (!state.isActive || state.steps.length === 0) return;
        const step = state.steps[state.currentIndex], total = state.steps.length;
        const q = id => document.getElementById(id);
        if (q('nav-step-count')) q('nav-step-count').textContent = '\u0e08\u0e38\u0e14\u0e17\u0e35\u0e48 ' + (state.currentIndex + 1) + '/' + total;
        if (q('nav-progress-bar')) q('nav-progress-bar').style.width = (((state.currentIndex + 1) / total) * 100) + '%';
        if (q('nav-dest-title')) q('nav-dest-title').textContent = step.name;
        if (q('nav-dest-tag')) q('nav-dest-tag').textContent = step.category || '\u0e2a\u0e16\u0e32\u0e19\u0e17\u0e35\u0e48\u0e17\u0e48\u0e2d\u0e07\u0e40\u0e17\u0e35\u0e48\u0e22\u0e27';
        if (q('nav-dest-img')) q('nav-dest-img').src = step.image || 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=300';
        if (q('nav-dest-time')) q('nav-dest-time').textContent = step.arrivalStr || '--:--';
        const prevBtn = q('nav-btn-prev'), nextBtn = q('nav-btn-next');
        if (prevBtn) prevBtn.disabled = state.currentIndex === 0;
        if (nextBtn) {
            if (state.currentIndex === total - 1) {
                nextBtn.innerHTML = '<span>\u0e2a\u0e34\u0e49\u0e19\u0e2a\u0e38\u0e14\u0e17\u0e23\u0e34\u0e1b</span>';
                nextBtn.style.background = 'linear-gradient(135deg,#3B82F6,#1D4ED8)';
            } else {
                nextBtn.innerHTML = '<span>\u0e16\u0e36\u0e07\u0e41\u0e25\u0e49\u0e27 / \u0e16\u0e31\u0e14\u0e44\u0e1b</span><i class="fa-solid fa-arrow-right"></i>';
                nextBtn.style.background = 'linear-gradient(135deg,#10B981,#059669)';
            }
        }
        updateLiveDistance();
        highlightItinerary();
        highlightSegment();
        focusCurrentStepOnMap();
        showGenericInstruction();
        state.navSteps = []; state.maneuverIdx = 0;
        clearNavRoute();   // ล้างเส้นนำทางเก่าก่อนดึงสำหรับจุดใหม่
        fetchNavSteps();   // ดึงเส้นใหม่สำหรับจุดถัดไป
    }

    function fitAllStepsOnMap() {
        if (!state.map || typeof L === 'undefined' || state.steps.length === 0) return;
        try {
            const pts = state.steps.filter(s => s.lat && s.lng).map(s => [s.lat, s.lng]);
            if (typeof startCoords !== 'undefined' && startCoords?.lat) pts.push([startCoords.lat, startCoords.lng]);
            if (pts.length > 0) { const b = L.latLngBounds(pts); if (b.isValid()) state.map.fitBounds(b, { padding: [60, 60], maxZoom: 14, animate: true, duration: 1 }); }
        } catch (e) { }
    }

    function focusCurrentStepOnMap() {
        if (!state.map || typeof L === 'undefined') return;
        const step = state.steps[state.currentIndex];
        if (!step) return;
        state.map.invalidateSize();

        // During active navigation → always zoom 18 at user position
        if (state.isActive && state.userLocation) {
            setNavigationCamera(state.userLocation.lat, state.userLocation.lng, 18, true);
            return;
        }
        // During active navigation but no GPS yet → zoom 18 at start position
        if (state.isActive) {
            const initPos = typeof startCoords !== 'undefined' && startCoords?.lat ? startCoords : null;
            if (initPos) {
                setNavigationCamera(initPos.lat, initPos.lng, 18, true);
                return;
            }
        }
        // Not navigating (called from outside) → show overview
        const next = state.steps[state.currentIndex + 1];
        if (next?.lat) {
            const b = L.latLngBounds([[step.lat, step.lng], [next.lat, next.lng]]);
            state.map.fitBounds(b, { padding: [80, 80], maxZoom: 15, animate: true });
        } else {
            state.map.flyTo([step.lat, step.lng], 15, { animate: true, duration: 0.8 });
        }
    }


    function highlightSegment() {
        if (typeof routeLines === 'undefined' || !routeLines) return;
        routeLines.forEach((line, idx) => {
            if (idx === state.currentIndex) {
                if (state.map && !state.map.hasLayer(line)) line.addTo(state.map);
                // ซ่อน original segment line ถ้ามี navPolylineAhead แล้ว (ไม่ทับซ้อน)
                if (state.navPolylineAhead) {
                    if (line.options) line.setStyle({ opacity: 0, weight: 0 });
                } else {
                    if (line.options) line.setStyle({ opacity: 1, weight: 8 });
                    if (line.bringToFront) line.bringToFront();
                }
            } else { if (state.map && state.map.hasLayer(line)) line.removeFrom(state.map); }
        });
    }

    function highlightItinerary() {
        document.querySelectorAll('.itinerary-item').forEach((item, idx) => {
            item.classList.remove('nav-item-active', 'nav-item-completed');
            const pill = item.querySelector('.nav-status-pill'); if (pill) pill.remove();
            if (idx === state.currentIndex) {
                item.classList.add('nav-item-active');
                const p = document.createElement('div'); p.className = 'nav-status-pill active';
                p.innerHTML = '<i class="fa-solid fa-location-arrow fa-beat-fade"></i> \u0e01\u0e33\u0e25\u0e31\u0e07\u0e40\u0e14\u0e34\u0e19\u0e17\u0e32\u0e07\u0e44\u0e1b\u0e17\u0e35\u0e48\u0e19\u0e35\u0e49';
                item.appendChild(p); item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else if (idx < state.currentIndex) {
                item.classList.add('nav-item-completed');
                const p = document.createElement('div'); p.className = 'nav-status-pill completed';
                p.innerHTML = '<i class="fa-solid fa-check"></i> \u0e16\u0e36\u0e07\u0e41\u0e25\u0e49\u0e27'; item.appendChild(p);
            }
        });
    }

    function nextStep() {
        if (!state.isActive) return;
        if (state.currentIndex < state.steps.length - 1) { state.currentIndex++; updateStepUI(); }
        else showCompletedModal();
    }

    function prevStep() {
        if (!state.isActive) return;
        if (state.currentIndex > 0) { state.currentIndex--; updateStepUI(); }
    }

    function showCompletedModal() {
        const modal = document.getElementById('nav-completed-modal'); if (!modal) return;
        const places = state.steps.filter(s => !s.isEndLocation).length;
        const q = id => document.getElementById(id);
        if (q('nav-stat-places')) q('nav-stat-places').textContent = places + ' \u0e41\u0e2b\u0e48\u0e07';
        const dEl = document.getElementById('summary-distance');
        if (q('nav-stat-distance')) q('nav-stat-distance').textContent = dEl ? dEl.textContent : '--';
        const tEl = document.getElementById('summary-time');
        if (q('nav-stat-time')) q('nav-stat-time').textContent = tEl ? tEl.textContent : '--';
        modal.style.display = 'flex';
    }

    function closeCompletedModal() {
        const modal = document.getElementById('nav-completed-modal');
        if (modal) modal.style.display = 'none'; stop();
    }

    function stop() {
        if (mapBearingAnimId) { cancelAnimationFrame(mapBearingAnimId); mapBearingAnimId = null; }
        state.isActive = false;
        stopLocationWatcher();
        stopCompassWatch();

        // ── ล้างเส้นนำทาง ──
        clearNavRoute();

        // ── ปิด 3D mode และคืนค่ามุมมอง 2D ปกติ ──
        enable3DMode(false);
        setCameraState('FOLLOWING');

        // ── เปิด touch rotation คืนเมื่อหยุดนำทาง ──
        if (state.map && state.map.touchRotate && typeof state.map.touchRotate.enable === 'function') {
            state.map.touchRotate.enable();
        }
        if (state.map && typeof state.map.setBearing === 'function') {
            state.map.setBearing(0);
            state.mapBearing = 0;
        }
        updateCompassBtn(0);

        // reset card collapse state
        _cardCollapsed = false;
        const cardBody2    = document.querySelector('.nav-card-body');
        const cardActions2 = document.querySelector('.nav-card-actions');
        if (cardBody2) cardBody2.classList.remove('nav-collapsed');
        if (cardActions2) cardActions2.classList.remove('nav-collapsed');
        const colIcon = document.getElementById('nav-collapse-icon');
        if (colIcon) colIcon.style.transform = 'rotate(0deg)';

        const overlay = document.getElementById('trip-navigation-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.classList.remove('card-collapsed');
        }
        document.querySelectorAll('.itinerary-item').forEach(item => {
            item.classList.remove('nav-item-active', 'nav-item-completed');
            const pill = item.querySelector('.nav-status-pill'); if (pill) pill.remove();
        });
        if (typeof routeLines !== 'undefined' && routeLines) {
            routeLines.forEach(line => {
                if (state.map && !state.map.hasLayer(line)) line.addTo(state.map);
                // คืนค่า style เดิม (ก่อนการนำทาง เส้นอาจถูกซ่อนไว้)
                if (line.options) { const d = !!line.options.dashArray; line.setStyle({ opacity: d ? 0.8 : 0.9, weight: d ? 5 : 6 }); }
            });
        }
        if (state.map && typeof routeLines !== 'undefined' && routeLines?.length > 0) {
            try { const g = new L.featureGroup(routeLines); state.map.fitBounds(g.getBounds(), { padding: [40, 40] }); } catch (e) { }
        }
        if (typeof userLiveMarker !== 'undefined' && userLiveMarker && state.map)
            if (!state.map.hasLayer(userLiveMarker)) userLiveMarker.addTo(state.map);
    }


    // ── Public: compass button action (Google Maps Style) ──
    // ระหว่าง navigate: หากหมุนดูรอบๆ อยู่ ให้กลับสู่ตำแหน่งนำทาง (Recenter)
    // หากไม่ได้ navigate: หมุนแผนที่กลับทิศเหนือ (0°)
    function resetNorth() {
        if (state.isActive && state.map) {
            recenterNavigation();
        } else if (state.map && typeof state.map.setBearing === 'function') {
            state.map.setBearing(0, { animate: true, duration: 0.4 });
            state.mapBearing = 0;
            updateCompassBtn(0);
        }
    }

    // ── อัปเดตเข็มทิศหมุนตาม Bearing (เข็มแดงชี้ทิศเหนือเสมอ) ──
    function updateCompassBtn(bearing) {
        const needle = document.getElementById('nav-compass-needle');
        if (needle) needle.style.transform = `rotate(${-bearing}deg)`;
        const icon = document.getElementById('nav-compass-icon');
        if (icon) icon.style.transform = `rotate(${-bearing}deg)`;
        const btn = document.getElementById('nav-compass-btn');
        if (btn) btn.classList.toggle('rotated', Math.abs(bearing % 360) > 4);
    }

    // ── Toggle bottom nav card (ซ่อน/แสดง body + actions) ──
    let _cardCollapsed = false;
    function toggleCard() {
        const cardBody    = document.querySelector('.nav-card-body');
        const cardActions = document.querySelector('.nav-card-actions');
        const icon        = document.getElementById('nav-collapse-icon');
        const overlay     = document.getElementById('trip-navigation-overlay');
        if (!cardBody) return;
        _cardCollapsed = !_cardCollapsed;
        if (_cardCollapsed) {
            cardBody.classList.add('nav-collapsed');
            cardActions && cardActions.classList.add('nav-collapsed');
            if (overlay) overlay.classList.add('card-collapsed');
            if (icon) icon.style.transform = 'rotate(180deg)';
        } else {
            cardBody.classList.remove('nav-collapsed');
            cardActions && cardActions.classList.remove('nav-collapsed');
            if (overlay) overlay.classList.remove('card-collapsed');
            if (icon) icon.style.transform = 'rotate(0deg)';
        }
    }

    // ── Open Google Maps App for Turn-by-Turn GPS navigation ──
    function openGoogleMaps() {
        if (!state.isActive || state.steps.length === 0) return;
        const currentStep = state.steps[state.currentIndex];
        if (!currentStep || isNaN(currentStep.lat) || isNaN(currentStep.lng)) return;
        const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${currentStep.lat},${currentStep.lng}&travelmode=driving`;
        window.open(gmapsUrl, '_blank');
    }

    return {
        start,
        stop,
        nextStep,
        prevStep,
        openGoogleMaps,
        showCompletedModal,
        closeCompletedModal,
        resetNorth,
        recenterNavigation,
        toggleCard,
        getState: () => state
    };
})();
