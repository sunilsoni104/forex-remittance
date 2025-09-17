/**
 * Header Scroll Behavior
 * Handles utility bar hiding/showing on scroll
 * Modern smooth transitions with performance optimization
 */

document.addEventListener('DOMContentLoaded', function() {
    const utilityBar = document.getElementById('utilityBar');
    const headerSection = document.querySelector('.header-section');
    let lastScrollTop = 0;
    let ticking = false;

    // Check if elements exist
    if (!utilityBar || !headerSection) {
        console.warn('Header elements not found');
        return;
    }

    /**
     * Update header state based on scroll position
     */
    function updateHeader() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // Hide utility bar on scroll down, show on scroll up
        if (scrollTop > 100) {
            utilityBar.classList.add('hidden');
            headerSection.classList.add('header-fixed');
        } else {
            utilityBar.classList.remove('hidden');
            headerSection.classList.remove('header-fixed');
        }
        
        lastScrollTop = scrollTop;
        ticking = false;
    }

    /**
     * Request animation frame for smooth performance
     */
    function requestTick() {
        if (!ticking) {
            requestAnimationFrame(updateHeader);
            ticking = true;
        }
    }

    // Add scroll event listener with throttling
    window.addEventListener('scroll', requestTick, { passive: true });

    // Handle resize events
    window.addEventListener('resize', function() {
        // Recalculate header state on resize
        updateHeader();
    });

    // Initialize header state
    updateHeader();
});
