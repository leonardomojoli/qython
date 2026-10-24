// frontend/src/components/shared/CustomNotification.js

import React from 'react';
import './CustomNotification.css';

const CustomNotification = ({ message, type, onClose, style }) => {
  if (!message) {
    return null;
  }

  return (
    <div className={`notification ${type}`} style={style}>
      <p>{message}</p>
      {typeof onClose === 'function' ? (
        <button onClick={onClose}>×</button>
      ) : (
        <button disabled>×</button>
      )}
    </div>
  );
};

export default CustomNotification;
