// Carrega o Google Picker (gapi) sob demanda — mesmo padrão do SDK on-demand do
// LatreoVerificationModal: promise em nível de módulo + injeção de <script> com guard.
let _pickerPromise = null;

export function loadPickerApi() {
  if (window.google && window.google.picker) return Promise.resolve();
  if (_pickerPromise) return _pickerPromise;

  _pickerPromise = new Promise((resolve, reject) => {
    const loadPicker = () => {
      window.gapi.load('picker', {
        callback: resolve,
        onerror: () => { _pickerPromise = null; reject(new Error('gapi picker load failed')); },
      });
    };

    if (window.gapi) { loadPicker(); return; }

    const existing = document.querySelector('script[data-gapi-picker]');
    if (existing) {
      existing.addEventListener('load', loadPicker);
      existing.addEventListener('error', () => { _pickerPromise = null; reject(new Error('gapi load failed')); });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.setAttribute('data-gapi-picker', '1');
    script.onload = loadPicker;
    script.onerror = () => { _pickerPromise = null; reject(new Error('gapi script load failed')); };
    document.head.appendChild(script);
  });

  return _pickerPromise;
}
