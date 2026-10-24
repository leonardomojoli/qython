// frontend/src/components/academic/ShareResultModal.js
// Modal for sharing quiz results on LinkedIn and other platforms

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateShareCard } from '../../api';
import styles from './ShareResultModal.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faTimes, faDownload, faLinkedin, faTwitter,
    faSpinner, faShareAlt, faCopy, faCheck
} from '@fortawesome/free-solid-svg-icons';
import { faLinkedin as faLinkedinBrand, faTwitter as faTwitterBrand } from '@fortawesome/free-brands-svg-icons';

const ShareResultModal = ({
    isOpen,
    onClose,
    examCode,
    examName,
    examFlag,
    score,
    rankPosition,
    percentile,
    seasonName
}) => {
    const { t } = useTranslation();
    const [cardData, setCardData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);

    const handleGenerateCard = async () => {
        if (cardData) return; // Already generated

        setIsLoading(true);
        setError(null);

        try {
            const result = await generateShareCard({
                exam_code: examCode,
                exam_name: examName,
                exam_flag: examFlag,
                score: score,
                rank_position: rankPosition,
                percentile: percentile,
                season_name: seasonName
            });
            setCardData(result);
        } catch (err) {
            setError(t('errorGeneratingCard'));
            console.error('Error generating share card:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Generate card when modal opens
    React.useEffect(() => {
        if (isOpen && !cardData && !isLoading) {
            handleGenerateCard();
        }
    }, [isOpen]);

    const handleShareLinkedIn = () => {
        if (!cardData) return;

        const text = encodeURIComponent(cardData.share_text);
        const url = encodeURIComponent(cardData.share_url);
        window.open(
            `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
            '_blank',
            'width=600,height=600'
        );
    };

    const handleShareTwitter = () => {
        if (!cardData) return;

        const text = encodeURIComponent(cardData.share_text);
        const url = encodeURIComponent(cardData.share_url);
        window.open(
            `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
            '_blank',
            'width=600,height=400'
        );
    };

    const handleDownload = () => {
        if (!cardData?.image_data) return;

        const link = document.createElement('a');
        link.href = cardData.image_data;
        link.download = `qython-resultado-${examCode}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleCopyText = async () => {
        if (!cardData?.share_text) return;

        try {
            await navigator.clipboard.writeText(`${cardData.share_text} ${cardData.share_url}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>
                    <FontAwesomeIcon icon={faTimes} />
                </button>

                <div className={styles.modalHeader}>
                    <FontAwesomeIcon icon={faShareAlt} className={styles.headerIcon} />
                    <h2>{t('shareResult')}</h2>
                    <p>{t('shareResultDesc')}</p>
                </div>

                <div className={styles.cardPreview}>
                    {isLoading ? (
                        <div className={styles.loadingState}>
                            <FontAwesomeIcon icon={faSpinner} spin className={styles.spinner} />
                            <span>{t('generatingCard')}</span>
                        </div>
                    ) : error ? (
                        <div className={styles.errorState}>
                            <p>{error}</p>
                            <button onClick={handleGenerateCard}>{t('tryAgain')}</button>
                        </div>
                    ) : cardData?.image_data ? (
                        <img
                            src={cardData.image_data}
                            alt="Share Card"
                            className={styles.cardImage}
                        />
                    ) : null}
                </div>

                <div className={styles.shareActions}>
                    <button
                        className={`${styles.shareButton} ${styles.linkedin}`}
                        onClick={handleShareLinkedIn}
                        disabled={!cardData}
                    >
                        <FontAwesomeIcon icon={faLinkedinBrand} />
                        LinkedIn
                    </button>

                    <button
                        className={`${styles.shareButton} ${styles.twitter}`}
                        onClick={handleShareTwitter}
                        disabled={!cardData}
                    >
                        <FontAwesomeIcon icon={faTwitterBrand} />
                        Twitter/X
                    </button>

                    <button
                        className={`${styles.shareButton} ${styles.download}`}
                        onClick={handleDownload}
                        disabled={!cardData}
                    >
                        <FontAwesomeIcon icon={faDownload} />
                        {t('download')}
                    </button>

                    <button
                        className={`${styles.shareButton} ${styles.copy}`}
                        onClick={handleCopyText}
                        disabled={!cardData}
                    >
                        <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
                        {copied ? t('copied') : t('copyText')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ShareResultModal;
