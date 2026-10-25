// src/index.js

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
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