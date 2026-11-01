// frontend/src/components/copilot/NavItem.js

import React, { useState, useEffect } from 'react';
import styles from './ConversationNavBar.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart, faBrain, faCommentDots, faTimes } from '@fortawesome/free-solid-svg-icons';
import ConfirmationModal from '../shared/ConfirmationModal'; // Importar o novo modal
import { useTranslation } from 'react-i18next'; // Importar useTranslation

const NavItem = ({ conversation, isActive, onSelect, onDelete, onAnimationEnd }) => {
    const { t } = useTranslation(); // Inicializar o hook de tradução
    const [isVisible, setIsVisible] = useState(!conversation.isNew);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); // Estado para o modal

    useEffect(() => {
        if (conversation.isNew) {
            const addClassTimer = setTimeout(() => {
                setIsVisible(true);
            }, 50);

            const cleanupTimer = setTimeout(() => {
                if (typeof onAnimationEnd === 'function') {
                    onAnimationEnd(conversation.id);
                }
            }, 600);

            return () => {
                clearTimeout(addClassTimer);
                clearTimeout(cleanupTimer);
            };
        }
    }, [conversation.isNew, conversation.id, onAnimationEnd]);

    const getIconForConversation = (conv) => {
        const title = conv.title.toLowerCase();
        if (title.includes('coração') || title.includes('cardio')) return faHeart;
        if (title.includes('cérebro') || title.includes('neuro')) return faBrain;
        return faCommentDots;
    };

    const handleDeleteClick = (e) => {
        e.stopPropagation();
        setIsDeleteModalOpen(true); // Abrir o modal em vez de window.confirm
    };

    const confirmDelete = () => {
        onDelete(conversation.id);
        setIsDeleteModalOpen(false); // Fechar o modal após a confirmação
    };

    const navItemClasses = [
        styles.navItem,
        isActive ? styles.active : '',
        isVisible ? styles.visible : ''
    ].join(' ');

    return (
        <>
            <div
                className={navItemClasses}
                onClick={() => onSelect(conversation.id)}
                title={conversation.title}
            >
                <FontAwesomeIcon icon={getIconForConversation(conversation)} className={styles.icon} />
                <span className={styles.title}>{conversation.title}</span>
                <button
                    className={styles.deleteButton}
                    onClick={handleDeleteClick}
                    title={t('deleteConversationTitle')}
                >
                    <FontAwesomeIcon icon={faTimes} />
                </button>
            </div>
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title={t('deleteConversationTitle')}
                message={t('deleteConversationMessage', { title: conversation.title })}
                confirmButtonText={t('delete')}
                cancelButtonText={t('cancel')}
            />
        </>
    );
};

export default NavItem;