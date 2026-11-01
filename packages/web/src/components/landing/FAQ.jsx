import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './FAQ.css';

function FAQ({ data }) {
    const { t } = useTranslation();
    const [openItem, setOpenItem] = useState(null);

    const toggleItem = (id) => {
        setOpenItem(openItem === id ? null : id);
    };

    return (
        <div className="faq-container">
            {data.map((item) => (
                <div
                    key={item.questionKey}
                    className={`faq-item ${openItem === item.questionKey ? 'open' : ''}`}
                >
                    <button
                        className="faq-question"
                        onClick={() => toggleItem(item.questionKey)}
                        aria-expanded={openItem === item.questionKey}
                    >
                        <span>{t(item.questionKey)}</span>
                        <span className="faq-icon">{openItem === item.questionKey ? '−' : '+'}</span>
                    </button>
                    <div className="faq-answer">
                        <p>{t(item.answerKey)}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default FAQ;
