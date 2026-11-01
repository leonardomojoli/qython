// frontend/src/components/user/ProfileHeader.js
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Profile.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera } from '@fortawesome/free-solid-svg-icons';
import defaultAvatar from '../../assets/default-profile.png';

const ProfileHeader = ({ user, preview, onAvatarClick }) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  if (!user) return null;

  return (
    <div className={styles.profileHeaderContainer}>
      <div
        className={styles.profileHeaderAvatarContainer}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onAvatarClick}
      >
        <img
          src={preview}
          alt={t('profilePictureAlt')}
          className={styles.profilePicture}
          onError={(e) => { e.target.onerror = null; e.target.src = defaultAvatar; }}
        />
        {isHovered && (
          <div className={styles.avatarHoverOverlay}>
            <FontAwesomeIcon icon={faCamera} />
            <span>{t('editAvatar')}</span>
          </div>
        )}
      </div>
      <div className={styles.profileHeaderText}>
        <h2 className={styles.profileHeaderName}>{user.full_name}</h2>
        {user.username && (
          <p className={styles.profileHeaderUsername}>@{user.username}</p>
        )}
        <span className={styles.profileHeaderOccupation}>{user.occupation}</span>
      </div>
    </div>
  );
};

export default ProfileHeader;