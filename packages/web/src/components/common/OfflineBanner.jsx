import React from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

const bannerStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 10000,
  backgroundColor: '#F59E0B',
  color: '#000',
  textAlign: 'center',
  padding: '6px 16px',
  fontSize: '13px',
  fontWeight: 600,
  transition: 'transform 0.3s ease',
};

const hiddenStyle = {
  ...bannerStyle,
  transform: 'translateY(-100%)',
};

export default function OfflineBanner() {
  const isOnline = useOnlineStatus();

  return (
    <div style={isOnline ? hiddenStyle : bannerStyle}>
      Modo offline — alguns recursos podem estar indisponíveis
    </div>
  );
}
