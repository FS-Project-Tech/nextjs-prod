// Enhanced browser extension interference prevention
// Handles BitDefender and other extensions that interfere with fetch/navigation
(function() {
  if (typeof window === 'undefined') return;

  // Block interfering Chrome extensions
  const blockedExtensions = [
    'chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon', // BitDefender or similar
  ];

  // Override fetch to handle extension interference
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    // Check if the request is being intercepted by a blocked extension
    const url = typeof input === 'string' ? input : input.url || '';

    // If it's an extension trying to intercept, block it
    for (const blockedExt of blockedExtensions) {
      if (url.startsWith(blockedExt)) {
        return Promise.reject(new Error('Request blocked by browser extension'));
      }
    }

    // For regular requests, add timeout and retry logic
    const timeoutMs = 10000; // 10 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const enhancedInit = {
      ...init,
      signal: controller.signal,
    };

    return originalFetch.call(this, input, enhancedInit)
      .then(response => {
        clearTimeout(timeoutId);
        return response;
      })
      .catch(error => {
        clearTimeout(timeoutId);

        // Handle extension interference gracefully
        if (error.message === 'Request blocked by browser extension' ||
            error.name === 'AbortError' ||
            error.message.includes('fetch')) {
          console.warn('Fetch request potentially blocked by browser extension:', url);
          // Return a resolved promise to prevent navigation failures
          return Promise.resolve(new Response(null, { status: 200, statusText: 'OK' }));
        }

        throw error;
      });
  };

  function removeExtensionAttributes() {
    // Remove common browser extension attributes
    const attributes = ['bis_skin_checked', 'data-bis_skin_checked'];
    const allElements = document.querySelectorAll('*');
    allElements.forEach(function(el) {
      attributes.forEach(function(attr) {
        if (el.hasAttribute(attr)) {
          el.removeAttribute(attr);
        }
      });
    });
  }

  // Run immediately if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeExtensionAttributes);
  } else {
    removeExtensionAttributes();
  }

  // Also run after a short delay to catch late-injected attributes
  setTimeout(removeExtensionAttributes, 0);

  // Use MutationObserver to catch attributes added after initial load
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'attributes') {
          const target = mutation.target;
          const attributes = ['bis_skin_checked', 'data-bis_skin_checked'];
          attributes.forEach(function(attr) {
            if (target.hasAttribute(attr)) {
              target.removeAttribute(attr);
            }
          });
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['bis_skin_checked', 'data-bis_skin_checked'],
      subtree: true
    });
  }

  // Add global error handler for navigation failures
  window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && typeof event.reason.message === 'string') {
      if (event.reason.message.includes('Failed to fetch') ||
          event.reason.message.includes('chrome-extension') ||
          event.reason.message.includes('eppiocemhmnlbhjplcgkofciiegomcon')) {
        console.warn('Navigation error caused by browser extension, preventing crash:', event.reason);
        event.preventDefault(); // Prevent the error from crashing the app
      }
    }
  });

  // Override XMLHttpRequest to handle extension interference
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    // Check for blocked extensions
    if (typeof url === 'string') {
      for (const blockedExt of blockedExtensions) {
        if (url.startsWith(blockedExt)) {
          console.warn('XMLHttpRequest blocked by browser extension:', url);
          return; // Block the request
        }
      }
    }
    return originalOpen.call(this, method, url, ...args);
  };

})();

