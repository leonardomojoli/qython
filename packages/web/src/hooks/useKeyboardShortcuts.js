import { useEffect } from 'react';

/**
 * Custom hook for handling keyboard shortcuts
 * @param {Object} shortcuts - Map of key combinations to callback functions
 * Example: { 'Alt+1': () => switchTab('live'), 'Ctrl+s': () => save() }
 */
const useKeyboardShortcuts = (shortcuts) => {
    useEffect(() => {
        const handleKeyDown = (event) => {
            // Build the key string (e.g., "Alt+1", "Ctrl+Shift+S")
            let keyCombo = '';
            if (event.ctrlKey) keyCombo += 'Ctrl+';
            if (event.altKey) keyCombo += 'Alt+';
            if (event.shiftKey) keyCombo += 'Shift+';

            // Handle number keys and letters uniformly
            const key = event.key.toUpperCase();
            keyCombo += key;

            if (shortcuts[keyCombo]) {
                event.preventDefault();
                shortcuts[keyCombo]();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcuts]);
};

export default useKeyboardShortcuts;
