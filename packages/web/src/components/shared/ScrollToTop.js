import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    // Seleciona a área principal que tem o scroll
    const mainContent = document.querySelector('.main-content-area');

    if (mainContent) {
      // Força o scroll para 0 imediatamente, sem animação
      mainContent.scrollTop = 0;
    }

    // Garante também na janela (fallback)
    window.scrollTo(0, 0);

  }, [pathname]);

  return null;
};

export default ScrollToTop;