// frontend/src/components/copilot/ConversationNavBar.js

import React, { useRef } from 'react';
import styles from './ConversationNavBar.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart, faBrain, faCommentDots, faPlus, faTimes } from '@fortawesome/free-solid-svg-icons';
import NavItem from './NavItem';

const ConversationNavBar = ({ conversations, activeConversation, onSelectConversation, onNewChat, onDeleteConversation, onSessionAnimationEnd }) => {
    const navRef = useRef(null);

    const handleWheelScroll = (e) => {
        if (navRef.current) {
            navRef.current.scrollLeft += e.deltaY;
        }
    };

    return (
        <div className={styles.navBarContainer} onWheel={handleWheelScroll} ref={navRef}>
            <div className={styles.newChatButton} onClick={onNewChat} title="Nova Conversa">
                <FontAwesomeIcon icon={faPlus} className={styles.newChatIcon} />
            </div>

            {conversations.map((conv) => (
                <NavItem
                    key={conv.id}
                    conversation={conv}
                    isActive={conv.id === activeConversation}
                    onSelect={onSelectConversation}
                    onDelete={onDeleteConversation}
                    onAnimationEnd={onSessionAnimationEnd}
                />
            ))}
        </div>
    );
};

export default ConversationNavBar;