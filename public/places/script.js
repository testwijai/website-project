document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let allPlaces = getPlaces();
    let selectedCats = new Set(); // empty or 'ทั้งหมด' means all
    let currentSearch = '';
    let currentSort = 'rating';
    const favorites = JSON.parse(localStorage.getItem('kk_favorites') || '[]');

    // โหลดข้อมูลล่าสุดจาก PostgreSQL (Node.js API) ทันที
    if (typeof loadPlaces === 'function') {
        loadPlaces().then(freshPlaces => {
            if (freshPlaces && freshPlaces.length > 0) {
                allPlaces = freshPlaces;
                renderPlaces();
            }
        });
    }

    // ฟัง Event เมื่อมีการอัปเดตข้อมูลสถานที่
    window.addEventListener('placesUpdated', (e) => {
        if (e.detail && Array.isArray(e.detail) && e.detail.length > 0) {
            allPlaces = e.detail;
            renderPlaces();
        }
    });

    // --- DOM refs ---
    const grid = document.getElementById('placesGrid');
    const emptyState = document.getElementById('emptyState');
    const resultCount = document.getElementById('resultCount');
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearch');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const sortSelect = document.getElementById('sortSelect');

    // --- Render ---
    function getFiltered() {
        let list = [...allPlaces];

        if (selectedCats.size > 0 && !selectedCats.has('ทั้งหมด')) {
            list = list.filter(p => selectedCats.has(p.category));
        }
        if (currentSearch.trim()) {
            const q = currentSearch.toLowerCase().trim();
            list = list.filter(p => 
                (p.name || '').toLowerCase().includes(q) || 
                (p.description || '').toLowerCase().includes(q) ||
                (p.category || '').toLowerCase().includes(q)
            );
        }

        if (currentSort === 'rating') list.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
        else if (currentSort === 'reviews') list.sort((a, b) => (parseInt(b.reviews) || 0) - (parseInt(a.reviews) || 0));
        else if (currentSort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));

        return list;
    }

    function renderPlaces() {
        const list = getFiltered();
        grid.innerHTML = '';

        resultCount.textContent = `พบ ${list.length} สถานที่`;

        if (list.length === 0) {
            grid.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }
        grid.style.display = 'grid';
        emptyState.style.display = 'none';

        list.forEach(place => {
            const placeIdStr = String(place.id);
            const isFav = favorites.includes(placeIdStr);
            const card = document.createElement('div');
            card.className = 'place-card';
            card.dataset.id = placeIdStr;
            const imgUrl = place.image || 'https://images.unsplash.com/photo-1590766940554-638092019c00?w=600';
            const hours = place.opening_hours || place.openingHours || '';

            card.innerHTML = `
                <div class="place-img-wrap">
                    <img src="${imgUrl}" alt="${place.name}" class="place-img" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1590766940554-638092019c00?w=600'">
                    <div class="place-badge"><i class="fa-solid fa-location-dot"></i> ขอนแก่น</div>
                    <button class="place-fav ${isFav ? 'liked' : ''}" data-id="${placeIdStr}">
                        <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                    </button>
                </div>
                <div class="place-content">
                    <span class="place-category">${place.category}</span>
                    <h3 class="place-title">${place.name}</h3>
                    <div class="place-rating">
                        <span class="stars"><i class="fa-solid fa-star"></i> ${place.rating || '4.5'}</span>
                        <span class="count">(${place.reviews || 85} รีวิว)</span>
                        ${hours ? `<span style="margin-left: 8px; font-size: 0.8rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${hours}</span>` : ''}
                    </div>
                    <p class="place-desc">${place.description || ''}</p>
                </div>
            `;

            // Favorite toggle
            card.querySelector('.place-fav').addEventListener('click', (e) => {
                e.stopPropagation();
                const btn = e.currentTarget;
                const id = btn.dataset.id;
                const icon = btn.querySelector('i');
                const idx = favorites.indexOf(id);
                if (idx === -1) {
                    favorites.push(id);
                    btn.classList.add('liked');
                    icon.className = 'fa-solid fa-heart';
                } else {
                    favorites.splice(idx, 1);
                    btn.classList.remove('liked');
                    icon.className = 'fa-regular fa-heart';
                }
                localStorage.setItem('kk_favorites', JSON.stringify(favorites));
            });

            grid.appendChild(card);
        });
    }

    // --- Event Listeners ---
    const allBtn = document.querySelector('.filter-btn[data-cat="ทั้งหมด"]');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.dataset.cat;
            if (cat === 'ทั้งหมด') {
                selectedCats.clear();
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            } else {
                if (allBtn) allBtn.classList.remove('active');
                selectedCats.delete('ทั้งหมด');

                if (selectedCats.has(cat)) {
                    selectedCats.delete(cat);
                    btn.classList.remove('active');
                } else {
                    selectedCats.add(cat);
                    btn.classList.add('active');
                }

                // ถ้าไม่ได้เลือกหมวดหมู่ใดเลย ให้กลับไปเลือก "ทั้งหมด" อัตโนมัติ
                if (selectedCats.size === 0) {
                    if (allBtn) allBtn.classList.add('active');
                }
            }
            renderPlaces();
        });
    });

    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        clearBtn.style.display = currentSearch ? 'flex' : 'none';
        renderPlaces();
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        currentSearch = '';
        clearBtn.style.display = 'none';
        renderPlaces();
    });

    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderPlaces();
    });



    // --- Init ---
    renderPlaces();
});
