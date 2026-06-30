/**
 * ShiftFuel Shared General Utilities
 * Common helper functions used across all portals
 */

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} value - Value to escape
 * @returns {string} Escaped HTML-safe string
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&')
    .replaceAll('<', '<')
    .replaceAll('>', '>')
    .replaceAll('"', '"')
    .replaceAll("'", '&#039;');
}

/**
 * Format a number as USD currency
 * @param {number} value - Amount to format
 * @returns {string} Formatted currency string (e.g., "$15.00")
 */
export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value || 0));
}

/**
 * Format a phone number as (XXX) XXX-XXXX
 * @param {string} raw - Raw phone digits (10 or 11 digits)
 * @returns {string} Formatted phone number
 */
export function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return '';
}

/**
 * Clean a phone number to digits only
 * @param {string} value - Phone number in any format
 * @returns {string} Digits only
 */
export function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Format a time string as HH:MM AM/PM
 * @param {string} isoOrTime - ISO time string or HH:MM format
 * @returns {string} Formatted time (e.g., "2:30 PM")
 */
export function formatTimeShort(isoOrTime) {
  if (!isoOrTime) return '';
  try {
    const d = new Date(isoOrTime);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { 
    return ''; 
  }
}

/**
 * Format an ISO timestamp for display
 * @param {string} iso - ISO timestamp
 * @returns {string} Formatted date/time (e.g., "Jan 15, 2025, 2:30 PM")
 */
export function formatTimestamp(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/**
 * Convert an input value to a number, stripping non-numeric characters
 * @param {string} value - Input value
 * @returns {number} Numeric value
 */
export function numberFromInput(value) {
  return Number(String(value || '').replace(/[^0-9.\-]/g, '')) || 0;
}

/**
 * Format a date as YYYY-MM-DD
 * @param {Date} date - Date object
 * @returns {string} Formatted date
 */
export function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Get the maximum date string (3 months from now)
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function maxDateString() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return localDateString(d);
}

/**
 * Debounce a function call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle a function call
 * @param {Function} func - Function to throttle
 * @param {number} limit - Minimum time between calls in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Generate a random request number
 * @param {string} id - UUID or database ID
 * @returns {string} Request number (e.g., "SF-ABC123")
 */
export function publicRequestNumber(id) {
  return `SF-${String(id || '').slice(0, 8).toUpperCase()}`;
}

/**
 * Check if a value is a valid UUID
 * @param {string} value - Value to check
 * @returns {boolean}
 */
export function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

/**
 * Normalize an ID for comparison (handle both UUID and numeric)
 * @param {string|number} id - ID to normalize
 * @returns {string} Normalized ID string
 */
export function normalizeId(id) {
  if (!id) return '';
  return String(id).toLowerCase().trim();
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise<any>} Result of the function
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, i);
      console.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms:`, error.message);
      await sleep(delay);
    }
  }
}

/**
 * Truncate a string to a maximum length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to append if truncated
 * @returns {string} Truncated string
 */
export function truncate(str, maxLength = 100, suffix = '...') {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Deep clone an object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if two objects are equal (deep comparison)
 * @param {Object} a - First object
 * @param {Object} b - Second object
 * @returns {boolean}
 */
export function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}