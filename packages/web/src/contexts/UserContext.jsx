// src/contexts/UserContext.js
import React, { createContext, useState, useContext, useCallback } from 'react';
import { getUserInfo, updateUserProfile } from '../api';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [errorUser, setErrorUser] = useState(null);

  const fetchUserInfo = useCallback(async () => {
    try {
      const userData = await getUserInfo();
      setUser(userData);
      setErrorUser(null);
    } catch (error) {
      console.error("Erro ao buscar informações do usuário no UserContext:", error);
      setErrorUser(error);
      setUser(null);
    } finally {
      setLoadingUser(false);
    }
  }, []);

  const updatePreferences = useCallback(async (preferencesToUpdate) => {
    if (!user) return Promise.reject(new Error("User not available"));
    try {
      const updatedUserData = await updateUserProfile(preferencesToUpdate);
      setUser(updatedUserData);
      return updatedUserData;
    } catch (error) {
      console.error("Erro ao atualizar preferências do usuário no UserContext:", error);
      throw error;
    }
  }, [user]);

  const autosaveEnabled = user ? user.autosave_consultation_drafts : true;

  return (
    <UserContext.Provider value={{ user, setUser, loadingUser, errorUser, fetchUserInfo, refreshUser: fetchUserInfo, updatePreferences, autosaveEnabled }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);