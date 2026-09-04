import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../contexts/UserContext';
import qythonLogo from '../../assets/qython-imagotipo.png';
import LanguageSelector from './LanguageSelector';
import './PublicPageHeader.css';

function PublicPageHeader() {
  const { t } = useTranslation();
  const { user } = useUser();

  return (
    <header className="public-page-header">
      <div className="public-header-content">
        <Link to="/" className="public-logo">
          <img src={qythonLogo} alt="Qython" className="public-logo-img" />
        </Link>

        <div className="public-header-right">
          <LanguageSelector />

          {!user && (
            <Link to="/register" className="public-cta-button">
              {t('createFreeAccount', 'Criar Conta Grátis')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export default PublicPageHeader;
