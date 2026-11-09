// src/index.js

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Inter servida pelo próprio app (antes vinha do Google Fonts): funciona sem internet e
// não avisa o Google de que alguém abriu o Qython.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import './global.css';
import App from './App';
import './i18n';
import DNALoadingAnimation from './components/shared/DNALoadingAnimation';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.Suspense fallback={<DNALoadingAnimation />}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.Suspense>
);