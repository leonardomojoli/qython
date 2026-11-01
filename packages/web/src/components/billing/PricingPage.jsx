// frontend/src/components/billing/PricingPage.js
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import usePaymentGateways from '../../hooks/usePaymentGateways';
import { redirectToCheckout } from '../../utils/checkout';
import { useNotification } from '../../contexts/NotificationContext';
import { useUser } from '../../contexts/UserContext';
import styles from './PricingPage.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faTimes, faSpinner, faBuilding, faGem, faCreditCard, faBitcoinSign, faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { faBtc } from '@fortawesome/free-brands-svg-icons'; // Ícone do Bitcoin/Cripto
import ComingSoonModal from '../shared/ComingSoonModal';

const PricingPage = () => {
    const { t } = useTranslation();
    const { addNotification } = useNotification();
    const { user } = useUser();
    const isLoggedIn = !!user;
    const navigate = useNavigate();
    const location = useLocation();
    const [isLoading, setIsLoading] = useState(null);
    const [isAnnual, setIsAnnual] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('dlocal'); // 'dlocal' ou 'binance'
    const [showComingSoon, setShowComingSoon] = useState(false);
    const { gateways, anyEnabled } = usePaymentGateways();
    useEffect(() => {
        if (gateways.dlocal) setPaymentMethod('dlocal');
        else if (gateways.binance) setPaymentMethod('binance');
    }, [gateways.dlocal, gateways.binance]);

    const handleSubscribe = async (planKey) => {
        if (!isLoggedIn) {
            navigate('/register');
            return;
        }

        // Sem gateway habilitado → "Em breve" (dLocal fica OFF até go-live).
        if (!anyEnabled) {
            setShowComingSoon(true);
            return;
        }
        setIsLoading(planKey);
        try {
            await redirectToCheckout({
                planKey,
                interval: isAnnual ? 'annual' : 'monthly',
                provider: paymentMethod,
            });
        } catch (error) {
            addNotification(t('errorRedirectingToPayment'), 'error');
            setIsLoading(null);
        }
    };

    const handleContactSales = () => {
        navigate('/contact');
    };

    const handleBackToProfile = () => {
        navigate('/profile');
    };

    // Formatação de Preço Dinâmica
    const formatPrice = (basePriceUSD) => {
        if (basePriceUSD === 0) return t('free');

        let finalPrice = basePriceUSD;
        if (isAnnual) {
            finalPrice = basePriceUSD * 0.8; // 20% desconto
        }

        const symbol = paymentMethod === 'binance' ? '₮' : 'US$';
        const currency = paymentMethod === 'binance' ? 'USDT' : '';

        return `${symbol} ${finalPrice.toFixed(2)} ${currency}`;
    };

    // Verifica se é o plano atual do usuário
    const isCurrentPlan = (planKey) => {
        if (!user) return false;
        // Tratamento para caso o backend use 'free' e a key seja 'intern' (ou vice-versa)
        // Se user.subscription_plan for undefined, assumimos 'free'
        const currentPlan = (user.subscription_plan || 'free').toLowerCase();

        if (planKey === 'intern' && currentPlan === 'free') return true;
        return currentPlan === planKey.toLowerCase();
    };

    // Definição dos Planos (Preços base em USD)
    const plans = [
        {
            key: 'intern', // equivalante a free
            name: t('planIntern'),
            basePrice: 0,
            dracmas: '250',
            features: [
                { name: t('featureChatBasic'), included: true },
                { name: t('featureConsultationTools'), included: true },
                { name: t('featureLibraryRAG'), included: true },
                { name: t('featureMediaGenerationBasic'), included: true },
                { name: t('featureImageAnalysis'), included: true },
                { name: t('featurePremiumContent'), included: false },
                { name: t('featureArena'), included: false },
            ],
            cta: isLoggedIn ? (isCurrentPlan('intern') ? t('activePlan') : t('createFreeAccount')) : t('createFreeAccount'),
            action: () => isLoggedIn ? null : navigate('/register'),
            highlight: false,
            disabled: isLoggedIn && isCurrentPlan('intern')
        },
        {
            key: 'resident',
            name: t('planResident'),
            basePrice: 9.90, // Preço em Dólar
            dracmas: '1.200',
            features: [
                { name: t('featureChatBasic'), included: true },
                { name: t('featureConsultationTools'), included: true },
                { name: t('featureLibraryRAG'), included: true },
                { name: t('featureMediaGenerationBasic'), included: true },
                { name: t('featurePremiumContent'), included: true },
                { name: t('featureArena'), included: true },
                { name: t('featureImageAnalysis'), included: true },
            ],
            cta: isCurrentPlan('resident') ? t('activePlan') : t('subscribeNow'),
            action: () => handleSubscribe('resident'),
            highlight: false,
            disabled: isCurrentPlan('resident')
        },
        {
            key: 'staff',
            name: t('planStaff'),
            basePrice: 19.90, // Preço em Dólar
            dracmas: '2.400',
            features: [
                { name: t('featureChatBasic'), included: true },
                { name: t('featureConsultationTools'), included: true },
                { name: t('featureLibraryRAG'), included: true },
                { name: t('featureMediaGenerationBasic'), included: true },
                { name: t('featurePremiumContent'), included: true },
                { name: t('featureArena'), included: true },
                { name: t('featureImageAnalysis'), included: true },
            ],
            cta: isCurrentPlan('staff') ? t('activePlan') : t('subscribeNow'),
            action: () => handleSubscribe('staff'),
            highlight: true,
            disabled: isCurrentPlan('staff')
        },
        {
            key: 'specialist',
            name: t('planSpecialist'),
            basePrice: 49.90, // Preço em Dólar
            dracmas: '6.000',
            features: [
                { name: t('featureChatBasic'), included: true },
                { name: t('featureConsultationTools'), included: true },
                { name: t('featureLibraryRAG'), included: true },
                { name: t('featureMediaGenerationBasic'), included: true },
                { name: t('featurePremiumContent'), included: true },
                { name: t('featureArena'), included: true },
                { name: t('featureImageAnalysis'), included: true },
                { name: t('featurePriority'), included: true },
            ],
            cta: isCurrentPlan('specialist') ? t('activePlan') : t('subscribeNow'),
            action: () => handleSubscribe('specialist'),
            highlight: false,
            disabled: isCurrentPlan('specialist')
        },
        {
            key: 'enterprise',
            name: t('planEnterprise'),
            basePrice: null,
            dracmas: t('customized'),
            features: [
                { name: t('featureAPIAccess'), included: true },
                { name: t('featureSSO'), included: true },
                { name: t('featureAccountManager'), included: true },
                { name: t('featureTeamTraining'), included: true },
                { name: t('featureSLA'), included: true },
            ],
            cta: t('contactSales'),
            action: handleContactSales,
            highlight: false,
            isEnterprise: true,
            disabled: false
        }
    ];

    return (
        <div className={styles.pricingPageContainer}>
            <div className={styles.header}>
                <h1>{t('chooseYourPlan')}</h1>
                <p>{t('planSubtitle')}</p>

                <div className={styles.controlsContainer}>
                    {/* Toggle Mensal/Anual */}
                    <div className={styles.pricingToggleContainer}>
                        <span className={`${styles.toggleLabel} ${!isAnnual ? styles.activeLabel : ''}`} onClick={() => setIsAnnual(false)}>
                            {t('monthlyBilling')}
                        </span>
                        <button
                            className={`${styles.toggleButton} ${isAnnual ? styles.active : ''}`}
                            onClick={() => setIsAnnual(!isAnnual)}
                        >
                            <div className={styles.toggleHandle}></div>
                        </button>
                        <span className={`${styles.toggleLabel} ${isAnnual ? styles.activeLabel : ''}`} onClick={() => setIsAnnual(true)}>
                            {t('annualBilling')}
                            <span className={styles.discountBadge}>-20%</span>
                        </span>
                    </div>

                    {/* Seletor de Pagamento (dLocal/Binance) — só quando há escolha real */}
                    {(gateways.dlocal && gateways.binance) && (
                    <div className={styles.paymentMethodSelector}>
                        <button
                            className={`${styles.methodBtn} ${paymentMethod === 'dlocal' ? styles.methodActive : ''}`}
                            onClick={() => setPaymentMethod('dlocal')}
                        >
                            <FontAwesomeIcon icon={faCreditCard} /> {t('payWithCardShort')}
                        </button>
                        <button
                            className={`${styles.methodBtn} ${paymentMethod === 'binance' ? styles.methodActive : ''}`}
                            onClick={() => setPaymentMethod('binance')}
                        >
                            <FontAwesomeIcon icon={faBtc} /> {t('payWithCryptoShort')}
                        </button>
                    </div>
                    )}
                </div>
            </div>

            <div className={styles.plansGrid}>
                {plans.map((plan) => (
                    <div
                        key={plan.key}
                        className={`
                            ${styles.planCard} 
                            ${plan.highlight ? styles.featured : ''} 
                            ${plan.isEnterprise ? styles.enterpriseCard : ''}
                            ${plan.disabled ? styles.currentPlanCard : ''}
                        `}
                    >
                        {plan.highlight && <div className={styles.featuredBadge}>{t('recommended')}</div>}
                        {plan.isEnterprise && <FontAwesomeIcon icon={faBuilding} className={styles.enterpriseIcon} />}

                        <h3 className={styles.planName}>{plan.name}</h3>

                        <div className={styles.priceContainer}>
                            <span className={styles.price}>
                                {plan.basePrice !== null ? formatPrice(plan.basePrice) : plan.price}
                            </span>
                            {plan.basePrice !== null && plan.basePrice > 0 && <span className={styles.period}>{t('perMonth')}</span>}
                        </div>

                        {isAnnual && plan.basePrice !== null && plan.basePrice > 0 && (
                            <div className={styles.annualTotal}>Cobrado anualmente</div>
                        )}

                        <div className={styles.dracmasInfo}>
                            <div className={styles.dracmasHeader}>
                                <FontAwesomeIcon icon={faGem} className={styles.dracmaIcon} />
                                <span className={styles.dracmasAmount}>{plan.dracmas}</span>
                            </div>
                            <span className={styles.dracmasLabel}>
                                {plan.isEnterprise ? '' : t('dracmas') + ' ' + t('monthly')}
                            </span>
                        </div>

                        <div className={styles.divider}></div>

                        <ul className={styles.featuresList}>
                            {plan.features.map((feature, i) => (
                                <li key={i} className={!feature.included ? styles.featureDisabled : ''}>
                                    <div className={styles.iconWrapper}>
                                        <FontAwesomeIcon
                                            icon={feature.included ? faCheck : faTimes}
                                            className={feature.included ? styles.iconCheck : styles.iconTimes}
                                        />
                                    </div>
                                    <span className={styles.featureText}>
                                        {feature.name}
                                        {feature.note && <span className={styles.featureNote}> {feature.note}</span>}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <div className={styles.actionContainer}>
                            <button
                                onClick={plan.action}
                                disabled={isLoading !== null || plan.disabled}
                                className={`
                                    ${styles.ctaButton} 
                                    ${plan.highlight ? styles.ctaFeatured : ''} 
                                    ${plan.isEnterprise ? styles.ctaEnterprise : ''}
                                    ${plan.disabled ? styles.ctaDisabled : ''}
                                `}
                            >
                                {isLoading === plan.key ? <FontAwesomeIcon icon={faSpinner} spin /> : plan.cta}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Global Dashboard Navigation for Logged In Users */}
            {isLoggedIn && (
                <div style={{ textAlign: 'center', marginTop: '40px', paddingBottom: '40px' }}>
                    <button
                        onClick={() => navigate(location.state?.from === '/profile' ? '/profile' : '/copilot')}
                        className={styles.themeButtonSecondary}
                        style={{
                            background: 'transparent',
                            border: '1px solid #333',
                            color: '#888',
                            padding: '10px 20px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => { e.target.style.color = '#fff'; e.target.style.borderColor = '#fff'; }}
                        onMouseOut={(e) => { e.target.style.color = '#888'; e.target.style.borderColor = '#333'; }}
                    >
                        {location.state?.from === '/profile' ? (
                            <>
                                <FontAwesomeIcon icon={faArrowLeft} style={{ marginRight: '8px' }} />
                                {t('backToProfile')}
                            </>
                        ) : (
                            <>
                                {t('goToDashboard')} <FontAwesomeIcon icon={faArrowRight} style={{ marginLeft: '8px' }} />
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* Coming Soon Modal */}
            <ComingSoonModal
                isOpen={showComingSoon}
                onClose={() => setShowComingSoon(false)}
                userEmail={user?.email}
            />
        </div>
    );
};

export default PricingPage;
