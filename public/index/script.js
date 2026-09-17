document.addEventListener('DOMContentLoaded', () => {
    // --- Determine paths depending on whether we are at / or /index/ ---
    const isSubdir = window.location.pathname.includes('/index/');
    const basePath = isSubdir ? '../' : '';

    // --- Data Loading ---
    let placesList = [];
    if (typeof getPlaces === 'function') {
        placesList = getPlaces();
    } else if (typeof generateDummyPlaces === 'function') {
        placesList = generateDummyPlaces(7);
    }

    if (typeof loadPlaces === 'function') {
        loadPlaces().then(fresh => {
            if (fresh && fresh.length > 0) {
                placesList = fresh;
                renderPopularPlaces(currentCategory);
            }
        });
    }

    // --- Dynamic Popular Places Showcase ---
    const placesGrid = document.getElementById('popularPlacesGrid');
    const categoryBtns = document.querySelectorAll('.cat-pill-btn');
    let currentCategory = 'ทั้งหมด';

    function renderPopularPlaces(cat = 'ทั้งหมด') {
        if (!placesGrid) return;

        let filtered = [...placesList];
        if (cat !== 'ทั้งหมด') {
            filtered = filtered.filter(p => {
                if (!p.category) return false;
                if (p.category === cat) return true;
                if (cat === 'ธรรมชาติ' && p.category.includes('ธรรมชาติ')) return true;
                if (cat === 'คาเฟ่/ถ่ายรูป' && p.category.includes('คาเฟ่')) return true;
                if (cat === 'วัด/สถานที่ศักดิ์สิทธิ์' && (p.category.includes('วัด') || p.category.includes('ศักดิ์สิทธิ์'))) return true;
                if (cat === 'ตลาด/ช้อปปิ้ง' && (p.category.includes('ตลาด') || p.category.includes('ช้อปปิ้ง'))) return true;
                return false;
            });
        }

        // Take top 6 places
        const displayPlaces = filtered.slice(0, 6);

        if (displayPlaces.length === 0) {
            placesGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                    <i class="fa-regular fa-compass" style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--primary-color);"></i>
                    <p style="font-size: 1.1rem;">ไม่พบสถานที่ในหมวดหมู่นี้</p>
                </div>
            `;
            return;
        }

        placesGrid.innerHTML = displayPlaces.map(p => {
            let imgSrc = p.image || '';
            if (p.name.includes('พระมหาธาตุ') || p.name.includes('แก่นนคร') || p.name.includes('พระธาตุ') || !imgSrc || imgSrc.includes('wat-phra-mahathat') || imgSrc.includes('wat_phra_that')) {
                imgSrc = `${basePath}img/wat_phra_that.jpg`;
            } else if (!imgSrc.startsWith('http://') && !imgSrc.startsWith('https://') && !imgSrc.startsWith('/')) {
                imgSrc = `${basePath}${imgSrc}`;
            }
            const rating = p.rating || '4.8';
            const catName = p.category || 'ที่เที่ยวขอนแก่น';
            const time = p.timeSpent ? `${p.timeSpent} นาที` : '1-2 ชม.';
            const detailUrl = `${basePath}places/index.html?search=${encodeURIComponent(p.name)}`;

            return `
                <div class="place-modern-card scale-up visible">
                    <div class="place-card-header">
                        <span class="place-tag-pill"><i class="fa-solid fa-location-dot"></i> ${catName}</span>
                        <span class="place-rating-badge"><i class="fa-solid fa-star"></i> ${rating}</span>
                    </div>
                    <div class="place-card-img-wrap">
                        <img src="${imgSrc}" alt="${p.name}" class="place-card-img" onerror="this.onerror=null;this.src='${basePath}img/wat_phra_that.jpg'">
                    </div>
                    <div class="place-card-bottom">
                        <div class="place-card-text">
                            <h3 class="place-card-title">${p.name}</h3>
                            <p class="place-card-desc">${p.description || 'สถานที่ท่องเที่ยวแลนด์มาร์กสำคัญของขอนแก่นที่ไม่ควรพลาด'}</p>
                        </div>
                        <a href="${detailUrl}" class="place-circle-btn" aria-label="ดูรายละเอียด ${p.name}">
                            <i class="fa-solid fa-arrow-right"></i>
                        </a>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Category click listener
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            categoryBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.getAttribute('data-cat') || 'ทั้งหมด';
            renderPopularPlaces(currentCategory);
        });
    });

    renderPopularPlaces('ทั้งหมด');

    // --- 3D Mountain Parallax & Scroll Gimmicks ---
    function initParallaxHero() {
        const heroSection = document.getElementById('heroSection');
        const heroBgBase = document.getElementById('heroBgBase');
        const heroBehindText = document.getElementById('heroBehindText');
        const heroMountainFg = document.getElementById('heroMountainFg');
        const heroContent = document.getElementById('heroContent');
        const heroScrollCue = document.getElementById('heroScrollCue');
        const scrollProgressBar = document.getElementById('scrollProgressBar');
        const backToTopBtn = document.getElementById('backToTopBtn');

        let ticking = false;

        function onScroll() {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
                    const docHeight = document.documentElement.scrollHeight - window.innerHeight;

                    // 1. Reading Progress Bar at top
                    if (scrollProgressBar) {
                        const progress = docHeight > 0 ? (scrollY / docHeight) * 100 : 0;
                        scrollProgressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
                    }

                    // 2. Floating Back to Top Button
                    if (backToTopBtn) {
                        if (scrollY > 380) {
                            backToTopBtn.classList.add('visible');
                        } else {
                            backToTopBtn.classList.remove('visible');
                        }
                    }

                    // 3. 3D Mountain Parallax (while hero is in viewport)
                    if (heroSection) {
                        const heroHeight = heroSection.offsetHeight || 600;
                        if (scrollY <= heroHeight + 100) {
                            const ratio = scrollY / heroHeight;

                            // Background sky moves down subtly with depth zoom
                            if (heroBgBase) {
                                heroBgBase.style.transform = `translate3d(0, ${scrollY * 0.14}px, 0) scale(${1 + ratio * 0.05})`;
                            }

                            // KHONKAEN text rises up from behind the mountain and scales gently
                            if (heroBehindText) {
                                heroBehindText.style.transform = `translate3d(-50%, calc(-50% + ${scrollY * -0.32}px), 0) scale(${1 + ratio * 0.08})`;
                                heroBehindText.style.opacity = `${Math.max(0.15, 1 - ratio * 1.1)}`;
                            }

                            // Foreground mountain cliff moves at slower parallax speed for realistic depth
                            if (heroMountainFg) {
                                heroMountainFg.style.transform = `translate3d(0, ${scrollY * 0.06}px, 0)`;
                            }

                            // Hero Content floats up gently and dissolves
                            if (heroContent) {
                                heroContent.style.transform = `translate3d(0, ${scrollY * -0.18}px, 0)`;
                                heroContent.style.opacity = `${Math.max(0, 1 - ratio * 1.6)}`;
                            }

                            // Scroll cue disappears smoothly as soon as scrolling starts
                            if (heroScrollCue) {
                                heroScrollCue.style.opacity = `${Math.max(0, 1 - scrollY / 60)}`;
                                heroScrollCue.style.pointerEvents = scrollY > 40 ? 'none' : 'auto';
                            }
                        }
                    }

                    ticking = false;
                });
                ticking = true;
            }
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll(); // initial trigger

        // Smooth scroll to top when button is clicked
        if (backToTopBtn) {
            backToTopBtn.addEventListener('click', () => {
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            });
        }
    }

    initParallaxHero();
});

