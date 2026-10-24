import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import styles from './ComingSoonModal.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRocket, faSpinner, faCheckCircle, faEnvelope, faBell } from '@fortawesome/free-solid-svg-icons';
import { api } from '../../api';

/**
 * ComingSoonModal - Premium "Coming Soon" modal with email lead capture
 *
 * @param {boolean} isOpen - Controls visibility
 * @param {function} onClose - Called when closing the modal
 * @param {string} userEmail - If provided, uses this email automatically (logged in user)
 */
const ComingSoonModal = ({ isOpen, onClose, userEmail }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isAlreadyOnWaitlist, setIsAlreadyOnWaitlist] = useState(false);
  const [isCheckingWaitlist, setIsCheckingWaitlist] = useState(false);
  const [error, setError] = useState('');

  // Check if user is logged in (has email)
  const isLoggedIn = !!userEmail;

  // Check waitlist status when modal opens for logged-in users
  useEffect(() => {
    const checkWaitlistStatus = async () => {
      if (isOpen && isLoggedIn && userEmail) {
        setIsCheckingWaitlist(true);
        try {
          const response = await api.get(`/user/payment-waitlist/check/${encodeURIComponent(userEmail)}`);
          if (response.data.is_on_waitlist) {
            setIsAlreadyOnWaitlist(true);
          }
        } catch (err) {
          // Silently ignore - assume not on waitlist
          console.log('Could not check waitlist status:', err);
        } finally {
          setIsCheckingWaitlist(false);
        }
      }
    };
    checkWaitlistStatus();
  }, [isOpen, isLoggedIn, userEmail]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setIsSubmitted(false);
      setIsAlreadyOnWaitlist(false);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const emailToSubmit = isLoggedIn ? userEmail : email;

    if (!validateEmail(emailToSubmit)) {
      setError(t('invalidEmail') || 'Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);

    try {
      await api.post('/user/payment-waitlist', { email: emailToSubmit });
      setIsSubmitted(true);
    } catch (err) {
      if (err.response?.status === 409) {
        // For logged in users, this means they're already on the list - show success instead of error
        if (isLoggedIn) {
          setIsSubmitted(true);
        } else {
          setError(t('alreadyOnWaitlist') || 'This email is already on the waitlist.');
        }
      } else {
        setError(err.response?.data?.detail || t('errorOccurred') || 'An error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  // Determine what state to show
  const showSuccessState = isSubmitted || isAlreadyOnWaitlist;

  return ReactDOM.createPortal(
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        {/* Icon */}
        <div className={styles.iconContainer}>
          {isCheckingWaitlist ? (
            <FontAwesomeIcon icon={faSpinner} spin />
          ) : (
            <FontAwesomeIcon icon={showSuccessState ? faCheckCircle : faRocket} />
          )}
        </div>

        {isCheckingWaitlist ? (
          /* Loading state */
          <p className={styles.message}>{t('loading') || 'Loading...'}</p>
        ) : showSuccessState ? (
          <>
            {/* Success State - either just submitted or already on waitlist */}
            <h3 className={styles.title}>
              {isAlreadyOnWaitlist && !isSubmitted
                ? (t('youAreOnWaitlist') || "You're on the list!")
                : (t('thankYou') || 'Thank You!')}
            </h3>
            <p className={styles.message}>
              {isAlreadyOnWaitlist && !isSubmitted
                ? (t('alreadyOnWaitlistMessage') || "Great news! You're already signed up for notifications. We'll let you know as soon as premium plans are available.")
                : (t('waitlistSuccess') || "Perfect! You'll be notified as soon as we launch.")}
            </p>
            <button onClick={handleClose} className={styles.closeButton}>
              {t('close') || 'Close'}
            </button>
          </>
        ) : (
          <>
            {/* Coming Soon State */}
            <h3 className={styles.title}>{t('comingSoonTitle') || 'Coming Soon!'}</h3>
            <p className={styles.message}>
              {isLoggedIn
                ? (t('comingSoonMessageLoggedIn') || "We're finalizing our payment integration. Click below to be notified when premium plans become available!")
                : (t('comingSoonMessage') || "We're finalizing our payment integration. Leave your email to be notified when premium plans become available!")
              }
            </p>

            {isLoggedIn ? (
              /* Logged in user - simple button */
              <>
                {error && <p className={styles.errorText}>{error}</p>}
                <button
                  onClick={handleSubmit}
                  className={styles.submitButton}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <FontAwesomeIcon icon={faSpinner} spin />
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faBell} style={{ marginRight: '8px' }} />
                      {t('notifyMeWhenReady') || 'Notify me when ready'}
                    </>
                  )}
                </button>
              </>
            ) : (
              /* Not logged in - email form */
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.inputWrapper}>
                  <FontAwesomeIcon icon={faEnvelope} className={styles.inputIcon} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('emailPlaceholder') || 'your@email.com'}
                    className={styles.emailInput}
                    disabled={isSubmitting}
                  />
                </div>

                {error && <p className={styles.errorText}>{error}</p>}

                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={isSubmitting || !email.trim()}
                >
                  {isSubmitting ? (
                    <FontAwesomeIcon icon={faSpinner} spin />
                  ) : (
                    t('notifyMe') || 'Notify Me'
                  )}
                </button>
              </form>
            )}

            <button onClick={handleClose} className={styles.cancelLink}>
              {t('maybeLater') || 'Maybe later'}
            </button>
          </>
        )}
      </div>
    </div>,
    document.getElementById('modal-portal')
  );
};

export default ComingSoonModal;
