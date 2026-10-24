// src/contexts/NotificationContext.js
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import CustomNotification from '../components/shared/CustomNotification';

const NotificationContext = createContext();

let nextId = 0;

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const timersRef = useRef({});

  const removeNotification = useCallback((id) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addNotification = useCallback((message, type, duration = 5000) => {
    const id = ++nextId;
    setNotifications((prev) => {
      // Keep max 3 visible
      const updated = prev.length >= 3 ? prev.slice(1) : prev;
      return [...updated, { id, message, type }];
    });

    timersRef.current[id] = setTimeout(() => {
      removeNotification(id);
    }, duration);

    return id;
  }, [removeNotification]);

  return (
    <NotificationContext.Provider value={{ addNotification }}>
      {notifications.map((n, index) => (
        <CustomNotification
          key={n.id}
          message={n.message}
          type={n.type}
          onClose={() => removeNotification(n.id)}
          style={{ top: `${30 + index * 70}px` }}
        />
      ))}
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotification = () => useContext(NotificationContext);
