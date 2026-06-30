/**
 * ShiftFuel Shared Photo Utilities
 * Validation and helpers for photo uploads across worker and admin portals
 */

// Maximum file size: 5MB
export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

// Allowed MIME types
export const ALLOWED_PHOTO_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

// Allowed file extensions
export const ALLOWED_PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

/**
 * Validate a photo file before upload
 * @param {File} file - The file to validate
 * @returns {Object} {valid: boolean, error: string|null}
 */
export function validatePhotoFile(file) {
  // Check if file exists
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  // Check file size
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Photo is too large (${sizeMB}MB). Maximum size is 5MB. Please compress the image or choose a different photo.`,
    };
  }

  // Check file extension
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !ALLOWED_PHOTO_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Invalid file type (${extension || 'unknown'}). Please upload a JPG, PNG, or WebP image.`,
    };
  }

  // Check MIME type (client-side, but server should also validate)
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file format. Please upload a JPG, PNG, or WebP image.`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Compress an image file using canvas
 * @param {File} file - Original image file
 * @param {number} maxWidth - Maximum width in pixels (default 1920)
 * @param {number} maxHeight - Maximum height in pixels (default 1920)
 * @param {number} quality - JPEG quality 0-1 (default 0.8)
 * @returns {Promise<Blob>} Compressed image blob
 */
export function compressPhoto(file, maxWidth = 1920, maxHeight = 1920, quality = 0.8) {
  return new Promise((resolve, reject) => {
    // Validate file first
    const validation = validatePhotoFile(file);
    if (!validation.valid) {
      reject(new Error(validation.error));
      return;
    }

    const reader = new FileReader();
    
    reader.onload = (event) => {
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions
        let { width, height } = img;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not create canvas context'));
          return;
        }

        // Draw image
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            // Log compression savings
            const originalSize = file.size;
            const compressedSize = blob.size;
            const savings = ((1 - compressedSize / originalSize) * 100).toFixed(0);
            console.log(`[photo-utils] Compressed ${file.name}: ${originalSize} → ${compressedSize} bytes (${savings}% smaller)`);

            resolve(blob);
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = event.target?.result;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size (e.g., "2.3 MB")
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 bytes';
  
  const k = 1024;
  const sizes = ['bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Generate a unique file path for photo storage
 * @param {string} requestId - Service request ID
 * @param {string} photoType - Photo type (e.g., 'pickup_driver_front')
 * @param {string} extension - File extension
 * @returns {string} Storage path
 */
export function generatePhotoPath(requestId, photoType, extension = 'jpg') {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${requestId}/${timestamp}-${randomSuffix}-${photoType}.${extension}`;
}

/**
 * Validate photo type string
 * @param {string} photoType - Photo type to validate
 * @returns {boolean}
 */
export function isValidPhotoType(photoType) {
  if (!photoType || typeof photoType !== 'string') return false;
  
  // Allow alphanumeric, hyphens, and underscores
  return /^[a-z0-9_]+$/.test(photoType);
}