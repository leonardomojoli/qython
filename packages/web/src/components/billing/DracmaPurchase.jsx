// frontend/src/components/billing/DracmaPurchase.js
import React, { useState, useEffect } from 'react';
import styles from './DracmaPurchase.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGem, faSpinner, faBolt, faCreditCard } from '@fortawesome/free-solid-svg-icons';
import { faBtc } from '@fortawesome/free-brands-svg-icons';
import { useNotification } from '../../contexts/NotificationContext';
import { useUser } from '../../contexts/UserContext';
import ComingSoonModal from '../shared/ComingSoonModal';
import usePaymentGateways from '../../hooks/usePaymentGateways';
import { redirectToCheckout } from '../../utils/checkout';

const DracmaPurchase = () => {
  const { t } = useTranslation();
  const { addNotification } = useNotification();
  const { user } = useUser();
  const [loadingId, setLoadingId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('dlocal');
  const [showComingSoon, setShowComingSoon] = useState(false);
  const { gateways, anyEnabled } = usePaymentGateways();
  useEffect(() => {
    if (gateways.dlocal) setPaymentMethod('dlocal');
    else if (gateways.binance) setPaymentMethod('binance');
  }, [gateways.dlocal, gateways.binance]);

  // Pacotes em USD (margem >60%)
  const packages = [
    {
      id: 'pack_small',
      amount: '500',
      priceUSD: 5.00,
      popular: false,
      iconColor: '#40e0d0'
    },
    {
      id: 'pack_medium',
      amount: '2.000',
      priceUSD: 20.00,
      popular: true,
      badge: t('mostPopular'),
      iconColor: '#bb86fc'
    },
    {
      id: 'pack_large',
      amount: '4.000',
      priceUSD: 35.00,
      popular: false,
      badge: t('bestValue'),
      iconColor: '#ffd700'
    }
  ];

  const formatPrice = (price) => {
      if (paymentMethod === 'binance') return `₮ ${price.toFixed(2)} USDT`;
      return `US$ ${price.toFixed(2)}`;
  };

  const handlePurchase = async (pack) => {
    // Sem gateway habilitado → "Em breve" (dLocal fica OFF até go-live).
    if (!anyEnabled) {
      setShowComingSoon(true);
      return;
    }
    setLoadingId(pack.id);
    try {
      await redirectToCheckout({ packId: pack.id, provider: paymentMethod, type: 'one_time' });
    } catch (error) {
      addNotification(t('errorRedirectingToPayment'), 'error');
      setLoadingId(null);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('buyDracmas')}</h2>
        <p className={styles.subtitle}>Adquira créditos avulsos para usar recursos premium.</p>
        
        {(gateways.dlocal && gateways.binance) && (
        <div className={styles.paymentSelector}>
            <button
                className={`${styles.methodBtn} ${paymentMethod === 'dlocal' ? styles.active : ''}`}
                onClick={() => setPaymentMethod('dlocal')}
            >
                <FontAwesomeIcon icon={faCreditCard} /> {t('payWithCardShort')}
            </button>
            <button
                className={`${styles.methodBtn} ${paymentMethod === 'binance' ? styles.active : ''}`}
                onClick={() => setPaymentMethod('binance')}
            >
                <FontAwesomeIcon icon={faBtc} /> Binance Pay
            </button>
        </div>
        )}
      </div>

      <div className={styles.packagesGrid}>
        {packages.map((pack) => (
          <div 
            key={pack.id} 
            className={`${styles.packageCard} ${pack.popular ? styles.popular : ''}`}
          >
            {pack.badge && <div className={styles.badge}>{pack.badge}</div>}
            
            <div className={styles.iconWrapper} style={{ color: pack.iconColor }}>
              <FontAwesomeIcon icon={faGem} className={styles.gemIcon} />
            </div>

            <h3 className={styles.amount}>{pack.amount}</h3>
            <span className={styles.label}>{t('dracmas')}</span>

            <div className={styles.price}>{formatPrice(pack.priceUSD)}</div>

            <button 
              onClick={() => handlePurchase(pack)} 
              disabled={loadingId !== null}
              className={`${styles.buyButton} ${pack.popular ? styles.buyButtonPopular : ''}`}
            >
              {loadingId === pack.id ? (
                <FontAwesomeIcon icon={faSpinner} spin />
              ) : (
                <>
                  <FontAwesomeIcon icon={faBolt} style={{ marginRight: '8px' }} />
                  {t('buyNow')}
                </>
              )}
            </button>
          </div>
        ))}
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

export default DracmaPurchase;
