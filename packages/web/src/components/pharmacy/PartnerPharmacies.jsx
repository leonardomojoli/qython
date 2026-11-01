// frontend/src/components/pharmacy/PartnerPharmacies.js
import React, { useState, useEffect, useCallback } from 'react';
import styles from './PartnerPharmacies.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMapMarkerAlt, faPhone, faChevronDown, faChevronUp,
  faStoreAlt, faExternalLinkAlt, faLocationArrow
} from '@fortawesome/free-solid-svg-icons';
import { getPharmacies } from '../../api';

function PartnerPharmacies() {
  const { t } = useTranslation();
  const [pharmacies, setPharmacies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [userCoords, setUserCoords] = useState(null);
  const [expandedChain, setExpandedChain] = useState(null);
  const [locationRequested, setLocationRequested] = useState(false);

  const fetchPharmacies = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const data = await getPharmacies(params);
      setPharmacies(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUseLocation = () => {
    if (!navigator.geolocation) return;
    setLocationRequested(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        fetchPharmacies({ lat: coords.lat, lng: coords.lng, radius_km: 15 });
      },
      () => {
        setLocationRequested(false);
      }
    );
  };

  const handleCitySearch = () => {
    if (!city && !state) return;
    const params = {};
    if (city) params.city = city;
    if (state) params.state = state;
    fetchPharmacies(params);
  };

  useEffect(() => {
    // Load all pharmacies initially
    fetchPharmacies({});
  }, [fetchPharmacies]);

  // Group pharmacies by chain
  const groupByChain = (pharmacyList) => {
    const groups = {};
    const independent = [];

    for (const p of pharmacyList) {
      if (p.chain_id && p.chain_name) {
        if (!groups[p.chain_id]) {
          groups[p.chain_id] = {
            chain_id: p.chain_id,
            chain_name: p.chain_name,
            chain_logo: p.chain_logo,
            subscription_tier: p.subscription_tier || 'individual',
            units: [],
          };
        }
        groups[p.chain_id].units.push(p);
      } else {
        independent.push(p);
      }
    }

    // Sort: enterprise first, then regional, then individual
    const tierOrder = { enterprise: 0, regional: 1, individual: 2 };
    const sorted = Object.values(groups).sort((a, b) => {
      return (tierOrder[a.subscription_tier] || 3) - (tierOrder[b.subscription_tier] || 3);
    });

    return { chains: sorted, independent };
  };

  const { chains, independent } = groupByChain(pharmacies);

  const toggleChain = (chainId) => {
    setExpandedChain(expandedChain === chainId ? null : chainId);
  };

  const getTierBadge = (tier) => {
    if (tier === 'enterprise') return styles.tierEnterprise;
    if (tier === 'regional') return styles.tierRegional;
    return styles.tierIndividual;
  };

  const renderPharmacyUnit = (pharmacy) => (
    <div key={pharmacy.id} className={styles.unitCard}>
      <div className={styles.unitInfo}>
        <h5 className={styles.unitName}>{pharmacy.brand_name || pharmacy.name}</h5>
        <p className={styles.unitAddress}>
          <FontAwesomeIcon icon={faMapMarkerAlt} className={styles.unitIcon} />
          {pharmacy.address}, {pharmacy.city} - {pharmacy.state}
        </p>
        {pharmacy.phone && (
          <p className={styles.unitPhone}>
            <FontAwesomeIcon icon={faPhone} className={styles.unitIcon} />
            <a href={`tel:${pharmacy.phone}`} className={styles.phoneLink}>{pharmacy.phone}</a>
          </p>
        )}
      </div>
      <div className={styles.unitActions}>
        {pharmacy.latitude && pharmacy.longitude && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${pharmacy.latitude},${pharmacy.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.mapsLink}
            title={t('howToGetThere')}
          >
            <FontAwesomeIcon icon={faExternalLinkAlt} />
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      {/* Location controls */}
      <div className={styles.controls}>
        <button
          className={styles.locationButton}
          onClick={handleUseLocation}
          disabled={locationRequested && !userCoords}
        >
          <FontAwesomeIcon icon={faLocationArrow} />
          <span>{t('enableLocation')}</span>
        </button>

        <div className={styles.citySearch}>
          <input
            type="text"
            className={styles.cityInput}
            placeholder={t('city') || 'Cidade'}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <select
            className={styles.stateSelect}
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">UF</option>
            {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
          <button className={styles.searchCityButton} onClick={handleCitySearch}>
            <FontAwesomeIcon icon={faMapMarkerAlt} />
          </button>
        </div>
      </div>

      {loading && <div className={styles.loading}>{t('loading')}...</div>}

      {!loading && pharmacies.length === 0 && (
        <div className={styles.emptyState}>
          <FontAwesomeIcon icon={faStoreAlt} className={styles.emptyIcon} />
          <p>{t('noPharmaciesNearby')}</p>
        </div>
      )}

      {!loading && pharmacies.length > 0 && (
        <div className={styles.results}>
          {/* Chain groups */}
          {chains.map(chain => (
            <div key={chain.chain_id} className={styles.chainCard}>
              <button
                className={styles.chainHeader}
                onClick={() => toggleChain(chain.chain_id)}
              >
                <div className={styles.chainInfo}>
                  {chain.chain_logo && (
                    <img src={chain.chain_logo} alt={chain.chain_name} className={styles.chainLogo} />
                  )}
                  <div>
                    <h4 className={styles.chainName}>{chain.chain_name}</h4>
                    <span className={styles.chainUnits}>
                      {chain.units.length} {t('nearbyUnits')}
                    </span>
                  </div>
                </div>
                <div className={styles.chainRight}>
                  <span className={`${styles.tierBadge} ${getTierBadge(chain.subscription_tier)}`}>
                    {chain.subscription_tier === 'enterprise' ? 'Premium' : chain.subscription_tier === 'regional' ? 'Regional' : ''}
                  </span>
                  <FontAwesomeIcon
                    icon={expandedChain === chain.chain_id ? faChevronUp : faChevronDown}
                    className={styles.expandIcon}
                  />
                </div>
              </button>
              {expandedChain === chain.chain_id && (
                <div className={styles.chainUnitsContainer}>
                  {chain.units.map(renderPharmacyUnit)}
                </div>
              )}
            </div>
          ))}

          {/* Independent pharmacies */}
          {independent.length > 0 && (
            <div className={styles.independentSection}>
              {independent.map(renderPharmacyUnit)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PartnerPharmacies;
