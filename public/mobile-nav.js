/**
 * Mobile Navigation Handler - KaenGuide
 * Handles the responsive hamburger menu, slide-out drawer, backdrop, and login state.
 */
(function () {
    function initMobileNav() {
        const navbar = document.querySelector('.navbar');
        if (!navbar) return;

        // 1. Ensure Mobile Toggle Button exists in navbar
        let toggleBtn = document.getElementById('mobileMenuToggle');
        if (!toggleBtn) {
            toggleBtn = document.createElement('button');
            toggleBtn.id = 'mobileMenuToggle';
            toggleBtn.className = 'mobile-menu-toggle';
            toggleBtn.setAttribute('aria-label', 'เปิดเมนู');
            toggleBtn.innerHTML = `
                <span class="bar"></span>
                <span class="bar"></span>
                <span class="bar"></span>
            `;
            navbar.appendChild(toggleBtn);
        }

        // 2. Ensure Backdrop and Drawer exist
        let backdrop = document.getElementById('mobileNavBackdrop');
        let drawer = document.getElementById('mobileNavDrawer');

        if (!drawer) {
            // Determine active page based on current URL path
            const currentPath = window.location.pathname.toLowerCase();
            const isHome = currentPath.endsWith('index/index.html') || currentPath.endsWith('/') || (currentPath.endsWith('/index.html') && !currentPath.includes('tripplaner') && !currentPath.includes('customplan') && !currentPath.includes('places') && !currentPath.includes('about') && !currentPath.includes('admin'));
            const isTripPlanner = currentPath.includes('tripplaner');
            const isCustomPlan = currentPath.includes('customplan');
            const isPlaces = currentPath.includes('places');
            const isAbout = currentPath.includes('about');

            // Determine relative prefix for links
            const isInSubfolder = currentPath.includes('/index/') || currentPath.includes('/tripplaner/') || currentPath.includes('/customplan/') || currentPath.includes('/places/') || currentPath.includes('/about/');
            const p = isInSubfolder ? '../' : './';

            // Create Backdrop
            backdrop = document.createElement('div');
            backdrop.id = 'mobileNavBackdrop';
            backdrop.className = 'mobile-nav-backdrop';
            document.body.appendChild(backdrop);

            // Create Drawer
            drawer = document.createElement('div');
            drawer.id = 'mobileNavDrawer';
            drawer.className = 'mobile-nav-drawer';
            drawer.innerHTML = `
                <div class="mobile-nav-header">
                    <div class="logo">
                        <i class="fa-solid fa-map-location-dot"></i>
                        <div class="logo-text">
                            <span class="brand">KaenGuide</span>
                        </div>
                    </div>
                    <button class="mobile-nav-close" id="mobileNavClose" aria-label="ปิดเมนู">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="mobile-nav-links">
                    <a href="${p}index/index.html" class="mobile-nav-link ${isHome ? 'active' : ''}">
                        <i class="fa-solid fa-house"></i>
                        <span>หน้าแรก</span>
                    </a>
                    <a href="${p}tripplaner/index.html" class="mobile-nav-link ${isTripPlanner ? 'active' : ''}">
                        <i class="fa-solid fa-route"></i>
                        <span>วางแผนอัตโนมัติ</span>
                    </a>
                    <a href="${p}customplan/index.html" class="mobile-nav-link ${isCustomPlan ? 'active' : ''}">
                        <i class="fa-solid fa-pen-to-square"></i>
                        <span>วางแผนด้วยตัวเอง</span>
                    </a>
                    <a href="${p}places/index.html" class="mobile-nav-link ${isPlaces ? 'active' : ''}">
                        <i class="fa-solid fa-location-dot"></i>
                        <span>สถานที่ท่องเที่ยว</span>
                    </a>
                    <a href="${p}about/index.html" class="mobile-nav-link ${isAbout ? 'active' : ''}">
                        <i class="fa-solid fa-circle-info"></i>
                        <span>เกี่ยวกับเรา</span>
                    </a>
                </div>
            `;
            document.body.appendChild(drawer);
        }

        // 3. Ensure Mobile Bottom Navigation exists
        let bottomNav = document.getElementById('mobileBottomNav');
        if (!bottomNav) {
            bottomNav = document.createElement('nav');
            bottomNav.id = 'mobileBottomNav';
            bottomNav.className = 'mobile-bottom-nav';

            // Determine active page
            const currentPath = window.location.pathname.toLowerCase();
            const isHome = currentPath.endsWith('index/index.html') || currentPath.endsWith('/') || (currentPath.endsWith('/index.html') && !currentPath.includes('tripplaner') && !currentPath.includes('customplan') && !currentPath.includes('places') && !currentPath.includes('about') && !currentPath.includes('admin'));
            const isTripPlanner = currentPath.includes('tripplaner');
            const isCustomPlan = currentPath.includes('customplan');
            const isPlaces = currentPath.includes('places');
            const isAbout = currentPath.includes('about');

            const isInSubfolder = currentPath.includes('/index/') || currentPath.includes('/tripplaner/') || currentPath.includes('/customplan/') || currentPath.includes('/places/') || currentPath.includes('/about/');
            const p = isInSubfolder ? '../' : './';
            const homeLink = isInSubfolder ? `${p}index/index.html` : './index.html';

            bottomNav.innerHTML = `
                <a href="${homeLink}" class="mobile-bottom-nav-item ${isHome ? 'active' : ''}">
                    <i class="fa-solid fa-house"></i>
                    <span>หน้าแรก</span>
                </a>
                <a href="${p}customplan/index.html" class="mobile-bottom-nav-item ${isCustomPlan ? 'active' : ''}">
                    <i class="fa-solid fa-pen-to-square"></i>
                    <span>วางแผนเอง</span>
                </a>
                <a href="${p}tripplaner/index.html" class="mobile-bottom-nav-item center-fab ${isTripPlanner ? 'active' : ''}">
                    <div class="fab-circle">
                        <i class="fa-solid fa-route"></i>
                    </div>
                    <span>วางแผนอัตโนมัติ</span>
                </a>
                <a href="${p}places/index.html" class="mobile-bottom-nav-item ${isPlaces ? 'active' : ''}">
                    <i class="fa-solid fa-location-dot"></i>
                    <span>สถานที่เที่ยว</span>
                </a>
                <a href="${p}about/index.html" class="mobile-bottom-nav-item ${isAbout ? 'active' : ''}">
                    <i class="fa-solid fa-circle-info"></i>
                    <span>เกี่ยวกับเรา</span>
                </a>
            `;
            document.body.appendChild(bottomNav);
        }

        const closeBtn = document.getElementById('mobileNavClose');

        // Open Menu
        function openMenu() {
            toggleBtn.classList.add('active');
            drawer.classList.add('show');
            backdrop.classList.add('show');
            document.body.style.overflow = 'hidden';
        }

        // Close Menu
        function closeMenu() {
            toggleBtn.classList.remove('active');
            drawer.classList.remove('show');
            backdrop.classList.remove('show');
            document.body.style.overflow = '';
        }

        // Toggle on Hamburger Click
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (drawer.classList.contains('show')) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        // Close on X button click
        if (closeBtn) {
            closeBtn.addEventListener('click', closeMenu);
        }

        // Close on Backdrop click
        if (backdrop) {
            backdrop.addEventListener('click', closeMenu);
        }

        // Close on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && drawer.classList.contains('show')) {
                closeMenu();
            }
        });


    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileNav);
    } else {
        initMobileNav();
    }
})();
