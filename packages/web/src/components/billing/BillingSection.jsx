// frontend/src/components/billing/BillingSection.js
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styles from './BillingSection.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGem, faCreditCard, faHistory, faArrowRight, faReceipt, faClock, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import ComingSoonModal from '../shared/ComingSoonModal';
import usePaymentGateways from '../../hooks/usePaymentGateways';
import { api } from '../../api';

const BillingSection = ({ user, balance, refreshHistories }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { anyEnabled } = usePaymentGateways();
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [balanceBreakdown, setBalanceBreakdown] = useState(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(true);

  // Fetch balance breakdown with expiration info
  useEffect(() => {
    const fetchBalanceBreakdown = async () => {
      try {
        const response = await api.get('/billing/balance/breakdown');
        setBalanceBreakdown(response.data);
      } catch (error) {
        console.error('Failed to fetch balance breakdown:', error);
      } finally {
        setLoadingBreakdown(false);
      }
    };
    fetchBalanceBreakdown();
  }, []);

  // (Card de armazenamento aposentado na Biblioteca Drive-first: os originais vivem na
  // nuvem do usuário; storage deixou de ser feature de plano. Conectores ficam no Perfil.)

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Calculate days until expiration
  const getDaysUntil = (dateString) => {
    if (!dateString) return null;
    const now = new Date();
    const expDate = new Date(dateString);
    const diffTime = expDate - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Função para formatar o nome do plano
  const getPlanDisplayName = (plan, occupation) => {
    // Se for estudante com plano free, mostrar como "Interno"
    if ((!plan || plan === 'free') && occupation === 'Estudante de Medicina') {
      return 'Interno';
    }
    if (!plan) return 'Free';

    // Mapeamento de planos
    const map = {
      'free': 'Free',
      'interno': 'Interno',
      'student': 'Estudante',
      'monthly': t('monthlyPlan') || 'Mensal',
      'annual': t('annualPlan') || 'Anual',
      'pro': 'Pro',
      'advanced': 'Avançado',
      'resident': 'Residente'
    };
    return map[plan.toLowerCase()] || plan.charAt(0).toUpperCase() + plan.slice(1);
  };

  const currentPlan = getPlanDisplayName(user?.subscription_plan, user?.occupation);

  // Format bytes to human-readable
  return (
    <div className={styles.billingContainer}>

      <div className={styles.cardsGrid}>
        {/* Card de Assinatura */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={`${styles.iconWrapper} ${styles.iconSubscription}`}>
              <FontAwesomeIcon icon={faCreditCard} />
            </div>
            <h4 className={styles.cardTitle}>{t('yourSubscription')}</h4>
          </div>

          <div className={styles.cardContent}>
            <p className={styles.planLabel}>{t('currentPlan')}</p>
            <p className={styles.planValue}>{currentPlan}</p>
          </div>

          <button
            onClick={() => anyEnabled ? navigate('/pricing') : setShowComingSoon(true)}
            className={`${styles.actionButton} ${styles.btnSubscription}`}
          >
            {t('manageSubscription')} <FontAwesomeIcon icon={faArrowRight} />
          </button>
        </div>

        {/* Card de Saldo */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={`${styles.iconWrapper} ${styles.iconDracmas}`}>
              <FontAwesomeIcon icon={faGem} />
            </div>
            <h4 className={styles.cardTitle}>{t('dracmaBalance')}</h4>
          </div>

          <div className={styles.cardContent}>
            <p className={styles.balanceLabel}>{t('availableBalance')}</p>
            <p className={styles.balanceValue}>{balance?.toFixed(0) || '0'}</p>
            {user?.occupation?.toLowerCase().includes('estudante') && balance >= 300 && (
              <div className={styles.bonusBreakdown}>
                <span className={styles.planBadge}>💎 150 {t('fromPlan') || 'do Plano'}</span>
                <span className={styles.bonusBadge}>🎓 150 {t('studentBonus') || 'Bônus de Estudante'}</span>
              </div>
            )}
            {/* Expiration Warning */}
            {balanceBreakdown?.expiring_soon > 0 && (
              <div className={styles.expirationWarning}>
                <FontAwesomeIcon icon={faExclamationTriangle} className={styles.warningIcon} />
                <span>
                  {balanceBreakdown.expiring_soon.toFixed(0)} {t('dracmas')} {t('expiringIn30Days') || 'expirando em 30 dias'}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => anyEnabled ? navigate('/dracma-purchase') : setShowComingSoon(true)}
            className={`${styles.actionButton} ${styles.btnDracmas}`}
          >
            {t('buyMoreDracmas')} <FontAwesomeIcon icon={faGem} />
          </button>
        </div>

      </div>

      {/* Extrato de Dracmas */}
      <div className={styles.historySection}>
        <div className={styles.historyHeader}>
          <h4 className={styles.historyTitle}>
            <FontAwesomeIcon icon={faGem} /> {t('dracmaStatement') || 'Extrato de Dracmas'}
          </h4>
        </div>

        <div className={styles.statementList}>
          {loadingBreakdown ? (
            <div className={styles.loadingState}>
              <span>{t('loading') || 'Carregando...'}</span>
            </div>
          ) : balanceBreakdown?.batches?.length > 0 ? (
            balanceBreakdown.batches.map((batch, index) => {
              const daysUntil = getDaysUntil(batch.expires_at);
              const isExpiringSoon = daysUntil !== null && daysUntil <= 30;
              const sourceIcons = {
                'subscription': '💎',
                'internal_plan': '💎',
                'student_bonus': '🎓',
                'purchase': '💰',
                'promo': '🎁',
                'admin': '⚡',
                'migration': '📦',
                'registration': '🎉'
              };
              const sourceLabels = {
                'subscription': t('planCredits') || 'Créditos do Plano',
                'internal_plan': t('planCredits') || 'Créditos do Plano',
                'student_bonus': t('studentBonus') || 'Bônus de Estudante',
                'purchase': t('purchasedDracmas') || 'Dracmas Comprados',
                'promo': t('promoCredits') || 'Créditos Promocionais',
                'admin': t('adminCredits') || 'Créditos Admin',
                'migration': t('migratedCredits') || 'Créditos Migrados',
                'registration': t('welcomeBonus') || 'Bônus de Boas-vindas'
              };
              return (
                <div key={index} className={`${styles.statementItem} ${isExpiringSoon ? styles.expiringSoon : ''}`}>
                  <div className={styles.statementInfo}>
                    <span className={styles.statementIcon}>{sourceIcons[batch.source] || '💎'}</span>
                    <div>
                      <p className={styles.statementDesc}>{sourceLabels[batch.source] || batch.source}</p>
                      <span className={styles.statementDate}>
                        <FontAwesomeIcon icon={faClock} style={{ marginRight: '4px', fontSize: '0.75rem' }} />
                        {isExpiringSoon && daysUntil > 0 && (
                          <span className={styles.expiresWarningText}>
                            {t('expiresIn') || 'Expira em'} {daysUntil} {t('days') || 'dias'}
                          </span>
                        )}
                        {isExpiringSoon && daysUntil <= 0 && (
                          <span className={styles.expiresWarningText}>
                            {t('expiresToday') || 'Expira hoje'}
                          </span>
                        )}
                        {!isExpiringSoon && (
                          <span>{t('expiresOn') || 'Expira em'} {formatDate(batch.expires_at)}</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <span className={styles.statementAmount}>+{batch.amount.toFixed(0)}</span>
                </div>
              );
            })
          ) : (
            <>
              {/* Fallback to static display when no breakdown available */}
              <div className={styles.statementItem}>
                <div className={styles.statementInfo}>
                  <span className={styles.statementIcon}>💎</span>
                  <div>
                    <p className={styles.statementDesc}>{t('planCredits') || 'Créditos do Plano'}</p>
                    <span className={styles.statementDate}>{t('initial') || 'Inicial'}</span>
                  </div>
                </div>
                <span className={styles.statementAmount}>+150</span>
              </div>
              {user?.occupation?.toLowerCase().includes('estudante') && (
                <div className={styles.statementItem}>
                  <div className={styles.statementInfo}>
                    <span className={styles.statementIcon}>🎓</span>
                    <div>
                      <p className={styles.statementDesc}>{t('studentBonus')}</p>
                      <span className={styles.statementDate}>{t('monthlyBonus') || 'Bônus Mensal'}</span>
                    </div>
                  </div>
                  <span className={styles.statementAmountBonus}>+150</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Histórico de Pagamentos */}
      <div className={styles.historySection}>
        <div className={styles.historyHeader}>
          <h4 className={styles.historyTitle}>
            <FontAwesomeIcon icon={faHistory} /> {t('paymentHistory')}
          </h4>
          <button onClick={refreshHistories} className={styles.refreshButton}>
            {t('refresh')}
          </button>
        </div>

        {(!user.paymentHistory || user.paymentHistory.length === 0) ? (
          <div className={styles.emptyHistory}>
            <FontAwesomeIcon icon={faReceipt} className={styles.emptyIcon} />
            <p>{t('noPaymentHistory')}</p>
          </div>
        ) : (
          /* Tabela de histórico seria renderizada aqui */
          <p>Histórico disponível (tabela não implementada neste snippet)</p>
        )}
      </div>

      {/* Coming Soon Modal */}
      <ComingSoonModal
        isOpen={showComingSoon}
        onClose={() => setShowComingSoon(false)}
        userEmail={user?.email}
      />
    </div>
  );
};

export default BillingSection;
