// frontend/src/components/consultation/ConsultaDefinitions.js

import React, { useState, useEffect, useCallback } from 'react'; // Adicionado useCallback
import { useTranslation } from 'react-i18next';
import { api, getAnamnesisTemplates as fetchUserTemplatesApi, /* outras importações de api se necessário */ } from '../../api'; // Usar getAnamnesisTemplates da api.js
import { ANAMNESE_DATA } from '../../data/consultationTemplates';
import QythonTipTapEditor from './QythonTipTapEditor';
import { useNotification } from '../../contexts/NotificationContext';
import styles from '../user/Profile.module.css';

const ConsultaDefinitions = () => {
  const { t } = useTranslation();
  const { addNotification } = useNotification();

  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [selectedConsultationType, setSelectedConsultationType] = useState('');
  // Estado para armazenar o conteúdo inicial e verificar alterações
  const [initialTemplateContent, setInitialTemplateContent] = useState('');

  const [currentTemplateContent, setCurrentTemplateContent] = useState('');
  const [userTemplates, setUserTemplates] = useState([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  const specialties = Object.keys(ANAMNESE_DATA);
  const consultationTypesFixed = ['first', 'return'];

  const fetchUserTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const data = await fetchUserTemplatesApi();
      if (Array.isArray(data)) {
        setUserTemplates(data);
      } else {
        console.error('API de templates de anamnese não retornou um array:', data);
        setUserTemplates([]);
        addNotification(t('errorLoadingUserTemplates') + (data?.error ? `: ${data.error}` : ': Formato inválido'), 'error');
      }
    } catch (error) {
      console.error('Erro ao carregar templates de anamnese do usuário:', error);
      setUserTemplates([]);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [addNotification, t]);

  useEffect(() => {
    fetchUserTemplates();
  }, [fetchUserTemplates]);

  useEffect(() => {
    if (selectedSpecialty && selectedConsultationType) {
      setIsLoadingTemplates(true);
      const userCustomTemplate = userTemplates.find(
        (tmpl) => tmpl.specialty === selectedSpecialty && tmpl.consultation_type === selectedConsultationType
      );

      let contentToSet = '';
      if (userCustomTemplate) {
        contentToSet = userCustomTemplate.content;
      } else {
        const defaultTemplate = ANAMNESE_DATA[selectedSpecialty]?.[selectedConsultationType];
        contentToSet = defaultTemplate || '';
      }

      setCurrentTemplateContent(contentToSet);
      setInitialTemplateContent(contentToSet); // Salva o estado inicial
      setIsLoadingTemplates(false);
    } else {
      setCurrentTemplateContent('');
      setInitialTemplateContent('');
    }
  }, [selectedSpecialty, selectedConsultationType, userTemplates]);

  const handleCloseEditor = () => {
    // "Fecha" o editor limpando a seleção
    setSelectedConsultationType('');
    // Opcional: Limpar especialidade também se desejar fechar tudo
    // setSelectedSpecialty(''); 
  };

  const handleSaveTemplate = async () => {
    if (!selectedSpecialty || !selectedConsultationType) {
      addNotification(t('fillAllTemplateFields'), 'error');
      return;
    }

    // Verifica se houve alterações
    if (currentTemplateContent === initialTemplateContent) {
      addNotification(t('noChangesToSave'), 'info');
      handleCloseEditor(); // Fecha mesmo sem alterações, conforme comportamento padrão
      return;
    }

    try {
      const payload = {
        specialty: selectedSpecialty,
        consultation_type: selectedConsultationType,
        content: currentTemplateContent,
      };

      await api.post('/settings/anamnesis-templates', payload);

      await fetchUserTemplates();

      addNotification(t('templateSavedSuccess'), 'success');
      handleCloseEditor(); // Fecha o editor após salvar com sucesso
    } catch (error) {
      console.error('Erro ao salvar template:', error);
      addNotification(t('errorSavingTemplate') + (error.response?.data?.error ? `: ${error.response.data.error}` : ''), 'error');
    }
  };

  const handleRestoreDefault = async () => {
    if (!selectedSpecialty || !selectedConsultationType) {
      addNotification(t('selectTemplateToRestore'), 'error');
      return;
    }

    try {
      await api.delete(`/settings/anamnesis-templates/${selectedSpecialty}/${selectedConsultationType}`);

      setUserTemplates((prev) =>
        prev.filter(
          (tmpl) => !(tmpl.specialty === selectedSpecialty && tmpl.consultation_type === selectedConsultationType)
        )
      );

      const defaultTemplate = ANAMNESE_DATA[selectedSpecialty]?.[selectedConsultationType];
      const contentToSet = defaultTemplate || '';

      setCurrentTemplateContent(contentToSet);
      setInitialTemplateContent(contentToSet); // Atualiza o inicial também para evitar "alterações não salvas" falsas

      addNotification(t('templateRestoredSuccess'), 'success');
      // Não fecha automaticamente no restore, geralmente o usuário quer ver o resultado restaurado
    } catch (error) {
      console.error('Erro ao restaurar template padrão:', error);
      addNotification(t('errorRestoringTemplate') + (error.response?.data?.error ? `: ${error.response.data.error}` : ''), 'error');
    }
  };

  // Handler para mudança de conteúdo no editor
  const handleContentChange = (content) => {
    setCurrentTemplateContent(content);
  };

  return (
    <div className={styles['settings-subsection']}>
      <h4>{t('anamnesisTemplates')}</h4>
      <div className={styles['template-selection']}>
        <select
          value={selectedSpecialty}
          onChange={(e) => {
            setSelectedSpecialty(e.target.value);
            setSelectedConsultationType('');
          }}
          className={styles['settings-input']} // Aplicando classe de estilo geral
        >
          <option value="">{t('selectSpecialty')}</option>
          {specialties.map((spec) => (
            <option key={spec} value={spec}>
              {t(spec)}
            </option>
          ))}
        </select>

        <select
          value={selectedConsultationType}
          onChange={(e) => setSelectedConsultationType(e.target.value)}
          disabled={!selectedSpecialty}
          className={styles['settings-input']} // Aplicando classe de estilo geral
        >
          <option value="">{t('selectConsultationType')}</option>
          {/* Usar consultationTypesFixed que é ['first', 'return'] */}
          {consultationTypesFixed.map((type) => (
            <option key={type} value={type}>
              {/* Ajustar a chave de tradução conforme necessário, ex: 'firstConsultation', 'returnConsultation' */}
              {t(type === 'first' ? 'firstConsultation' : 'returnConsultation')}
            </option>
          ))}
        </select>
      </div>

      {/* Renderiza o editor apenas se specialty e type estiverem selecionados e templates não estiverem carregando */}
      {selectedSpecialty && selectedConsultationType && !isLoadingTemplates && (
        <div className={styles['template-editor-container']}>
          <QythonTipTapEditor
            key={`template-editor-${selectedSpecialty}-${selectedConsultationType}`}
            value={currentTemplateContent} // Usar value em vez de content
            onChange={handleContentChange} // Usar onChange em vez de onContentChange
            autosavePrefix={`template_${selectedSpecialty}_${selectedConsultationType}`} // Chave de autosave mais específica
            specialty={selectedSpecialty}
            consultationType={selectedConsultationType}
            height={400} // Definir altura padrão
          />
          <div className={styles['template-actions']}>
            <button onClick={handleSaveTemplate} className={`${styles['button-base']} ${styles['button-primary']}`}>{t('saveTemplate')}</button>
            <button onClick={handleRestoreDefault} className={`${styles['button-base']} ${styles['button-neutral']}`}>{t('restoreDefault')}</button>
          </div>
        </div>
      )}
      {isLoadingTemplates && selectedSpecialty && selectedConsultationType && (
        <div className={styles.editorPlaceholder}>{t('loadingTemplateContent')}</div>
      )}
      {(!selectedSpecialty || !selectedConsultationType) && (
        <div className={styles.editorPlaceholder}>{t('selectSpecialtyAndTypeToEditTemplate')}</div>
      )}
    </div>
  );
};

export default ConsultaDefinitions;