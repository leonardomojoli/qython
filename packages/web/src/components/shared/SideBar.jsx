// frontend/src/components/shared/SideBar.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '../../contexts/UserContext';
import { NavLink, Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
// Adicionei faShieldHalved aos imports
import { faUserMd, faBrain, faGraduationCap, faSignOutAlt, faShieldHalved, faPills } from '@fortawesome/free-solid-svg-icons';
import './SideBar.css';
import defaultAvatar from '../../assets/default-profile.png';
import qythonIsotipo from '../../assets/qython-isotipo.png';
import qythonImagotipo from '../../assets/qython-imagotipo.png';
import { useTranslation } from 'react-i18next';

import { WEB_URL as API_STATIC_FILES_URL } from '../../config';
const SIDEBAR_TRANSITION_DURATION = 300;

// Route prefetch map - dynamically import route chunks on hover
const routePrefetchMap = {
  '/copilot': () => import('../copilot/Chat'),
  '/consultation-manager': () => import('../consultation/ConsultationManager'),
  '/academic': () => import('../academic/AcademicManager'),
  '/pharmacy': () => import('../pharmacy/PharmacyManager'),
  '/profile': () => import('../user/Profile'),
};

// Track already prefetched routes to avoid duplicate imports
const prefetchedRoutes = new Set();

function SideBar({ onLogout, isOpen, toggleSidebar }) {
  const { t } = useTranslation();
  const { user } = useUser();
  const [showText, setShowText] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShowText(true), SIDEBAR_TRANSITION_DURATION);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setShowText(false);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isOpen]);

  let profilePictureSrc = defaultAvatar;
  if (user && user.profile_picture) {
    if (user.profile_picture.startsWith('http')) {
      profilePictureSrc = user.profile_picture;
    } else if (user.profile_picture.includes('presets') || user.profile_picture.includes('images/')) {
      // Presets: use direct path (relative or absolute depending on how stored, assuming stored relative to public root)
      profilePictureSrc = user.profile_picture.startsWith('/') ? user.profile_picture : `/${user.profile_picture}`;
    } else if (user.profile_picture !== 'default-profile.png') {
      profilePictureSrc = `${API_STATIC_FILES_URL}/static/uploads/profile_pictures/${user.profile_picture}`;
    }
  }

  const renderLinkText = (text) => {
    if (isOpen) {
      return (
        <span className={`link-text ${showText ? 'text-visible' : ''}`}>
          {text}
        </span>
      );
    }
    return null;
  };

  // Helper específico para tradução
  const renderTranslatedLinkText = (key) => renderLinkText(t(key));

  // Prefetch route chunk on hover for faster navigation
  const handlePrefetch = useCallback((route) => {
    if (prefetchedRoutes.has(route)) return;
    const prefetchFn = routePrefetchMap[route];
    if (prefetchFn) {
      prefetchedRoutes.add(route);
      prefetchFn().catch(() => {
        // Silently fail - prefetch is an optimization, not critical
        prefetchedRoutes.delete(route);
      });
    }
  }, []);

  // Handle click on closed sidebar to open it
  const handleSidebarClick = (e) => {
    if (!isOpen) {
      // Check if click was on a navigation link (let those work normally)
      const isNavLink = e.target.closest('.sidebar-link') || e.target.closest('.logout-button');
      if (!isNavLink) {
        toggleSidebar();
      }
    }
  };

  return (
    <div
      className={`sidebar ${isOpen ? 'open' : 'closed'}`}
      onClick={handleSidebarClick}
      role={!isOpen ? 'button' : undefined}
      tabIndex={!isOpen ? 0 : undefined}
      onKeyDown={!isOpen ? (e) => e.key === 'Enter' && toggleSidebar() : undefined}
    >
      <div className="sidebar-header">
        <button className="sidebar-toggle-internal" onClick={toggleSidebar} title={isOpen ? t('closeSidebar') : t('openSidebar')}>
          {isOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18" className="sidebar-toggle-icon">
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1" fill="none" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 9l-2 3 2 3" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18" className="sidebar-toggle-icon">
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1" fill="none" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 9l2 3-2 3" />
            </svg>
          )}
        </button>
        <Link to="/" className="sidebar-logo-link">
          <img
            src={qythonIsotipo}
            alt="Qython"
            className={`sidebar-logo-isotipo ${isOpen ? 'hidden' : ''}`}
          />
          <img
            src={qythonImagotipo}
            alt="Qython"
            className={`sidebar-logo-imagotipo ${isOpen && showText ? 'visible' : ''}`}
          />
        </Link>
      </div>

      <ul className="navigation-links">
        <li>
          <NavLink
            to="/copilot"
            className={({ isActive }) => isActive ? "sidebar-link active" : "sidebar-link"}
            onMouseEnter={() => handlePrefetch('/copilot')}
          >
            <FontAwesomeIcon icon={faBrain} className="sidebar-icon" />
            {renderTranslatedLinkText('copilotLabel')}
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/consultation-manager"
            className={({ isActive }) => isActive ? "sidebar-link active" : "sidebar-link"}
            onMouseEnter={() => handlePrefetch('/consultation-manager')}
          >
            <FontAwesomeIcon icon={faUserMd} className="sidebar-icon" />
            {renderTranslatedLinkText('consultationManager')}
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/academic"
            className={({ isActive }) => isActive ? "sidebar-link active" : "sidebar-link"}
            onMouseEnter={() => handlePrefetch('/academic')}
          >
            <FontAwesomeIcon icon={faGraduationCap} className="sidebar-icon" />
            {renderTranslatedLinkText('academic')}
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/pharmacy"
            className={({ isActive }) => isActive ? "sidebar-link active" : "sidebar-link"}
            onMouseEnter={() => handlePrefetch('/pharmacy')}
          >
            <FontAwesomeIcon icon={faPills} className="sidebar-icon" />
            {renderTranslatedLinkText('pharmacy')}
          </NavLink>
        </li>
      </ul>

      <div className="sidebar-footer">
        {/* LINK DE ADMIN (Só aparece se for admin) */}
        {user?.is_admin && (
          <NavLink to="/admin" className="sidebar-link admin-link">
            <FontAwesomeIcon icon={faShieldHalved} className="sidebar-icon" />
            {renderTranslatedLinkText('adminPanel')}
          </NavLink>
        )}

        <div className="separator"></div>

        <NavLink
          to="/profile"
          className={({ isActive }) => isActive ? "profile-link sidebar-link active" : "profile-link sidebar-link"}
          onMouseEnter={() => handlePrefetch('/profile')}
        >
          <img
            src={profilePictureSrc}
            alt={t('profile')}
            className="profile-icon sidebar-icon"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = defaultAvatar;
            }}
          />
          {renderTranslatedLinkText('profile')}
        </NavLink>

        <button onClick={onLogout} className="logout-button sidebar-link">
          <FontAwesomeIcon icon={faSignOutAlt} className="sidebar-icon" />
          {renderTranslatedLinkText('logout')}
        </button>
      </div>
    </div>
  );
}

export default SideBar;
