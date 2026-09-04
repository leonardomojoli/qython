// frontend/src/utils/localStorageService.js
// Centralized localStorage management with TTL, cleanup, and quota handling

const STORAGE_PREFIX = 'qython_';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Enhanced localStorage service with:
 * - Automatic TTL expiration
 * - Quota exceeded handling with cleanup
 * - Centralized key management
 * - Draft consultation retrieval
 */
const localStorageService = {
    /**
     * Store an item with optional TTL
     * @param {string} key - Storage key (prefix will be added automatically)
     * @param {any} value - Value to store (will be JSON stringified)
     * @param {number} ttlMs - Time to live in milliseconds (default: 7 days)
     * @returns {boolean} - Success status
     */
    setItem(key, value, ttlMs = DEFAULT_TTL_MS) {
        const fullKey = STORAGE_PREFIX + key;
        const item = {
            value,
            expiry: Date.now() + ttlMs,
            createdAt: Date.now(),
        };

        try {
            localStorage.setItem(fullKey, JSON.stringify(item));
            return true;
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                console.warn('[localStorage] Quota exceeded, running cleanup...');
                this.cleanup();
                try {
                    localStorage.setItem(fullKey, JSON.stringify(item));
                    return true;
                } catch (retryError) {
                    console.error('[localStorage] Still failed after cleanup:', retryError);
                    return false;
                }
            }
            console.error('[localStorage] Set error:', e);
            return false;
        }
    },

    /**
     * Get an item, returning null if expired or not found
     * @param {string} key - Storage key (prefix will be added automatically)
     * @returns {any|null} - Stored value or null
     */
    getItem(key) {
        const fullKey = STORAGE_PREFIX + key;
        const itemStr = localStorage.getItem(fullKey);

        if (!itemStr) return null;

        try {
            const item = JSON.parse(itemStr);

            // Check expiration
            if (item.expiry && Date.now() > item.expiry) {
                localStorage.removeItem(fullKey);
                return null;
            }

            return item.value;
        } catch (e) {
            // Legacy item without wrapper structure
            return itemStr;
        }
    },

    /**
     * Remove an item
     * @param {string} key - Storage key (prefix will be added automatically)
     */
    removeItem(key) {
        localStorage.removeItem(STORAGE_PREFIX + key);
    },

    /**
     * Cleanup expired items and optionally oldest items if over threshold
     * @param {number} targetFreePercent - Target percentage of quota to free (0-100)
     */
    cleanup(targetFreePercent = 20) {
        const keysToRemove = [];
        const itemsWithAge = [];

        // First pass: identify expired items and collect age data
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key.startsWith(STORAGE_PREFIX)) continue;

            try {
                const itemStr = localStorage.getItem(key);
                const item = JSON.parse(itemStr);

                if (item.expiry && Date.now() > item.expiry) {
                    keysToRemove.push(key);
                } else if (item.createdAt) {
                    itemsWithAge.push({ key, createdAt: item.createdAt, size: itemStr.length });
                }
            } catch (e) {
                // Skip malformed items
            }
        }

        // Remove expired items
        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
            console.log(`[localStorage] Cleaned expired: ${key}`);
        });

        // If still need more space, remove oldest items (but not auth tokens)
        if (targetFreePercent > 0 && itemsWithAge.length > 0) {
            itemsWithAge.sort((a, b) => a.createdAt - b.createdAt);
            const protectedPatterns = ['authToken', 'theme', 'i18nextLng'];

            let removed = 0;
            for (const item of itemsWithAge) {
                if (removed >= 3) break; // Limit cleanup to 3 oldest items per run
                if (protectedPatterns.some(p => item.key.includes(p))) continue;

                localStorage.removeItem(item.key);
                console.log(`[localStorage] Cleaned oldest: ${item.key}`);
                removed++;
            }
        }
    },

    /**
     * Get all draft consultations from localStorage
     * @returns {Array<{key: string, specialty: string, type: string, content: string, preview: string, createdAt: number}>}
     */
    getDraftConsultations() {
        const drafts = [];
        // Match QythonTipTapEditor format: qython_qythonAutosave_consultation_{specialty}_{type}
        const autosavePrefix = STORAGE_PREFIX + 'qythonAutosave_consultation_';

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key.startsWith(autosavePrefix)) continue;

            try {
                const itemStr = localStorage.getItem(key);
                let content, createdAt;

                try {
                    const parsed = JSON.parse(itemStr);
                    content = parsed.value || itemStr;
                    createdAt = parsed.createdAt || Date.now();
                } catch {
                    content = itemStr;
                    createdAt = Date.now();
                }

                // Parse key to extract specialty and type
                // Format: qython_qythonAutosave_consultation_{specialty}_{type}
                // After removing prefix, we get: {specialty}_{type}
                const remainder = key.replace(autosavePrefix, '');
                const parts = remainder.split('_');
                const specialty = parts[0] || 'unknown';
                const type = parts[1] || 'draft';

                // Generate preview (first 80 chars, stripped of markdown)
                const preview = content
                    .replace(/[#*_`>\-]/g, '')
                    .replace(/\n+/g, ' ')
                    .trim()
                    .substring(0, 80);

                drafts.push({
                    key: key.replace(STORAGE_PREFIX, ''),
                    specialty,
                    type,
                    content,
                    preview: preview + (preview.length >= 80 ? '...' : ''),
                    createdAt,
                });
            } catch (e) {
                console.warn(`[localStorage] Failed to parse draft: ${key}`, e);
            }
        }

        // Sort by most recent first
        return drafts.sort((a, b) => b.createdAt - a.createdAt);
    },

    /**
     * Get storage usage statistics
     * @returns {{used: number, total: number, percent: number}}
     */
    getUsageStats() {
        let used = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            used += key.length + (value ? value.length : 0);
        }

        const total = 5 * 1024 * 1024; // 5MB typical limit
        return {
            used,
            total,
            percent: Math.round((used / total) * 100),
        };
    },
};

export default localStorageService;
