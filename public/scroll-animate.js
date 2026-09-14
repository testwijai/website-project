/**
 * Scroll Animation - KaenGuide
 * Triggers entrance animations when elements scroll into view.
 * Add any of these classes to elements:
 *   .fade-up | .fade-left | .fade-right | .scale-up
 */
(function () {
    const ANIMATED_CLASSES = ['.fade-up', '.fade-left', '.fade-right', '.scale-up'];
    const selector = ANIMATED_CLASSES.join(', ');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Unobserve after animation so it doesn't re-trigger
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });

    function initObserver() {
        document.querySelectorAll(selector).forEach(el => observer.observe(el));
    }

    // Run after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initObserver);
    } else {
        initObserver();
    }
})();
