// frontend/src/contexts/ThemeContext.js

import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { useUser } from './UserContext';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
  const { user, loadingUser, updatePreferences } = useUser();
  const [theme, setTheme] = useState(() => {
    const storedTheme = localStorage.getItem('qython_theme');
    return storedTheme || 'light'; // Carrega do localStorage ou usa 'light'
  });

  // Efeito 1: Sincroniza o estado do tema com base nas preferências do usuário (se logado)
  // ou mantém o que foi carregado do localStorage/padrão se o usuário não tiver preferência definida.
  useEffect(() => {
    if (!loadingUser && user && user.theme_preference) {
      if (theme !== user.theme_preference) {
        setTheme(user.theme_preference);
      }
    }
    // Se não houver usuário ou preferência do usuário, o tema permanece como está
    // (inicializado do localStorage ou 'light').
    // Array de dependências: executa quando 'user' ou 'loadingUser' mudam.
    // 'theme' NÃO está aqui para evitar loops.
  }, [user, loadingUser]);

  // Efeito 2: Aplica o estado do tema atual ao DOM (atributo data-theme) e atualiza o localStorage.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('qython_theme', theme);
    // Array de dependências: executa sempre que o estado 'theme' mudar.
  }, [theme]);

  const toggleTheme = useCallback(async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';

    if (user) {
      try {
        // 1. Atualiza a preferência no backend.
        // Isso também irá atualizar o objeto 'user' no UserContext.
        await updatePreferences({ theme_preference: newTheme });
        
        // 2. Define o tema localmente na UI.
        // O Efeito 1 (acima) também pode ser acionado pela mudança no objeto 'user',
        // mas definir explicitamente aqui garante uma resposta mais imediata da UI.
        // Se o Efeito 1 definir o tema com base no `user.theme_preference` atualizado,
        // ele deverá definir para o mesmo `newTheme`, evitando conflitos.
        setTheme(newTheme);
      } catch (error) {
        console.error('Erro ao atualizar preferência de tema no backend:', error);
        // Considerar reverter a UI se a chamada ao backend falhar:
        // Por exemplo, se você tivesse uma atualização otimista antes do await:
        // setTheme(theme); // Reverte para o tema original
      }
    } else {
      // Sem usuário logado, apenas alterna localmente.
      // O Efeito 2 irá atualizar o localStorage.
      setTheme(newTheme);
    }
    // As dependências de useCallback devem incluir tudo que é usado dentro dele que pode mudar.
  }, [theme, user, updatePreferences, setTheme]);


  // Função para definir um tema específico (útil para os botões de rádio)
  const setThemeWithValue = useCallback(async (chosenTheme) => {
    if (theme === chosenTheme) return; // Não faz nada se já for o tema escolhido

    if (user) {
      try {
        await updatePreferences({ theme_preference: chosenTheme });
        setTheme(chosenTheme);
      } catch (error) {
        console.error('Erro ao definir preferência de tema no backend:', error);
      }
    } else {
      setTheme(chosenTheme);
    }
  }, [theme, user, updatePreferences, setTheme]);


  return (
    // Fornece setThemeWithValue para que os botões de rádio possam usá-lo
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: setThemeWithValue }}>
      {children}
    </ThemeContext.Provider>
  );
};
