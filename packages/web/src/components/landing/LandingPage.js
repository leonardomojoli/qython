import React, { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import "./LandingPage.css";
import "./LandingPageExtensions.css";
import qythonLogo from '../../assets/qython-imagotipo.png';
import defaultAvatar from '../../assets/default-profile.png';
import { FaLinkedin, FaInstagram, FaTiktok, FaYoutube } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faTimes, faBuilding, faGem, faSpinner, faCreditCard, faUser, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
import { faBtc } from '@fortawesome/free-brands-svg-icons';
import FeatureModal from './FeatureModal';
import FAQ from './FAQ';
import testimonials from '../../data/testimonials';
import faqData from '../../data/faqData';
import featuresData from '../../data/featuresData';
import { WEB_URL as API_STATIC_FILES_URL } from '../../config';
import impactMetrics from '../../data/impactMetrics';
import { getAdditionalFunctionalities } from '../../data/additionalFunctionalities';
import LanguageSelector from '../shared/LanguageSelector';
import { useUser } from '../../contexts/UserContext';
import ComingSoonModal from '../shared/ComingSoonModal';

function LandingPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, setUser } = useUser();
  const [isLoaded, setIsLoaded] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', content: null });
  const [navigationPath, setNavigationPath] = useState('');
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef(null);
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);

  // Lógica para foto de perfil do usuário logado
  let profilePictureSrc = defaultAvatar;
  if (user && user.profile_picture) {
    if (user.profile_picture.startsWith('http')) {
      profilePictureSrc = user.profile_picture;
    } else if (user.profile_picture.includes('presets') || user.profile_picture.includes('images/')) {
      profilePictureSrc = user.profile_picture.startsWith('/') ? user.profile_picture : `/${user.profile_picture}`;
    } else if (user.profile_picture !== 'default-profile.png') {
      profilePictureSrc = `${API_STATIC_FILES_URL}/static/uploads/profile_pictures/${user.profile_picture}`;
    }
  }

  // Estados de Preço
  const [isAnnual, setIsAnnual] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('stripe');

  // --- NOVA FUNÇÃO PARA SCROLL SUAVE ---
  const scrollToSection = (e, sectionId) => {
    e.preventDefault(); // Impede o comportamento padrão do link
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleNavigate = (path) => {
    setNavigationPath(path);
    setIsExiting(true);
  };

  const handleTransitionEnd = (e) => {
    if (e.propertyName === 'opacity' && isExiting && navigationPath) {
      navigate(navigationPath);
    }
  };

  const openFeatureModal = (title, content) => {
    setModalContent({ title, content });
    setIsModalOpen(true);
  };

  const closeFeatureModal = () => {
    setIsModalOpen(false);
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
    setProfileDropdownOpen(false);
    navigate('/');
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatPrice = (basePriceUSD) => {
    if (basePriceUSD === 0) return t('free');

    let finalPrice = basePriceUSD;
    if (isAnnual) {
      finalPrice = basePriceUSD * 0.8;
    }

    if (paymentMethod === 'stripe') {
      return `US$ ${finalPrice.toFixed(2)}`;
    } else {
      return `₮ ${finalPrice.toFixed(2)} USDT`;
    }
  };

  // --- VERIFICAÇÃO DO PLANO ATUAL ---
  const isCurrentPlan = (planKey) => {
    if (!user) return false;
    const currentPlan = (user.subscription_plan || 'free').toLowerCase();
    // 'intern' é o plano free
    if (planKey === 'intern' && currentPlan === 'free') return true;
    return currentPlan === planKey.toLowerCase();
  };

  // --- AÇÃO DE ASSINATURA (mostra Coming Soon se logado) ---
  const handleSubscribeAction = () => {
    if (user) {
      setShowComingSoonModal(true);
    } else {
      handleNavigate('/register');
    }
  };

  // --- DEFINIÇÃO DOS 5 PLANOS ---
  const plans = [
    {
      key: 'intern',
      name: t('planIntern'),
      basePrice: 0,
      period: '',
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
      cta: t('signUp'),
      action: () => handleNavigate('/register'),
      highlight: false
    },
    {
      key: 'resident',
      name: t('planResident'),
      basePrice: 9.90,
      period: '/mês',
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
      cta: t('subscribeNow'),
      action: handleSubscribeAction,
      highlight: false
    },
    {
      key: 'staff',
      name: t('planStaff'),
      basePrice: 19.90,
      period: '/mês',
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
      cta: t('subscribeNow'),
      action: handleSubscribeAction,
      highlight: true
    },
    {
      key: 'specialist',
      name: t('planSpecialist'),
      basePrice: 49.90,
      period: '/mês',
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
      cta: t('subscribeNow'),
      action: handleSubscribeAction,
      highlight: false
    },
    {
      key: 'enterprise',
      name: t('planEnterprise'),
      basePrice: null,
      period: '',
      dracmas: t('customized'),
      features: [
        { name: t('featureAPIAccess'), included: true },
        { name: t('featureSSO'), included: true },
        { name: t('featureAccountManager'), included: true },
        { name: t('featureTeamTraining'), included: true },
        { name: t('featureSLA'), included: true },
      ],
      cta: t('contactSales'),
      action: () => handleNavigate('/contact'),
      highlight: false,
      isEnterprise: true
    }
  ];

  useEffect(() => {
    document.documentElement.setAttribute('data-force-theme', 'light');
    const loadTimer = setTimeout(() => setIsLoaded(true), 500);
    return () => {
      clearTimeout(loadTimer);
      document.documentElement.removeAttribute('data-force-theme');
    };
  }, []);

  useEffect(() => {
    const handleScrollClass = () => {
      const landingPageElement = document.querySelector(".landing-page");
      if (window.scrollY > 50) {
        landingPageElement?.classList.add("scrolled");
      } else {
        landingPageElement?.classList.remove("scrolled");
      }
    };
    window.addEventListener("scroll", handleScrollClass);
    return () => window.removeEventListener("scroll", handleScrollClass);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, {
      threshold: 0.1
    });

    const elementsToAnimate = document.querySelectorAll('.scroll-animate');
    elementsToAnimate.forEach(el => observer.observe(el));

    return () => elementsToAnimate.forEach(el => observer.unobserve(el));
  }, []);

  return (
    <>
      <div
        className={`landing-page ${isLoaded ? "loaded" : ""} ${isExiting ? "exiting" : ""}`}
        onTransitionEnd={handleTransitionEnd}
      >
        <div className="content-wrapper">
          <header>
            <div className="logo">
              <img src={qythonLogo} alt="Qython" className="logo-img-full" />
            </div>

            <nav>
              <ul>
                <li><a href="#casos-de-uso" onClick={(e) => scrollToSection(e, 'casos-de-uso')}>{t('useCases')}</a></li>
                <li><a href="#planos" onClick={(e) => scrollToSection(e, 'planos')}>{t('pricing')}</a></li>
                <li><a href="#comunidade" onClick={(e) => scrollToSection(e, 'comunidade')}>{t('community')}</a></li>
              </ul>
            </nav>

            <div className="header-actions">
              <LanguageSelector />
              {user ? (
                <>
                  <button className="cta" onClick={() => handleNavigate('/copilot')}>
                    {t('goToDashboard', 'Ir para o Dashboard')}
                  </button>
                  <div className="profile-dropdown-container" ref={profileDropdownRef}>
                    <button
                      className="profile-dropdown-trigger"
                      onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                    >
                      <img
                        src={profilePictureSrc}
                        alt={t('profile')}
                        className="header-profile-img"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = defaultAvatar;
                        }}
                      />
                    </button>
                    {profileDropdownOpen && (
                      <div className="profile-dropdown-menu">
                        <button
                          className="profile-dropdown-item"
                          onClick={() => {
                            setProfileDropdownOpen(false);
                            handleNavigate('/profile');
                          }}
                        >
                          <FontAwesomeIcon icon={faUser} />
                          <span>{t('profile', 'Perfil')}</span>
                        </button>
                        <button
                          className="profile-dropdown-item profile-dropdown-logout"
                          onClick={handleLogout}
                        >
                          <FontAwesomeIcon icon={faSignOutAlt} />
                          <span>{t('logout', 'Sair')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <button className="cta cta-secondary" onClick={() => handleNavigate('/login')}>
                    {t('loginButton')}
                  </button>
                  <button className="cta" onClick={() => handleNavigate('/register')}>
                    {t('getStarted')}
                  </button>
                </>
              )}
            </div>
          </header>

          <section className="hero" id="hero">
            {/* Modern Aesthetic Background - Minimal Grid */}
            <div className="hero-modern-background"></div>

            <h1>
              {t('heroTitleNew', 'Sua Prática Médica, Elevada pela Inteligência Clínica.')}
            </h1>

            <p style={{ maxWidth: '700px', margin: '0 auto 35px auto' }}>
              {t('heroSubtitleNew', 'Menos burocracia, mais precisão diagnóstica e aprendizado contínuo.')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', position: 'relative', zIndex: 3 }}>

              {/* Botão Principal - muda baseado no estado de login */}
              {user ? (
                <button className="cta cta-glow" onClick={() => handleNavigate('/copilot')}>
                  {t('goToDashboard', 'Ir para o Dashboard')}
                </button>
              ) : (
                <button className="cta cta-glow" onClick={() => handleNavigate('/register')}>
                  {t('startWithFreeCredits', 'Começar com Créditos Grátis')}
                </button>
              )}

              {/* Trust Badges - Glassmorphism Pills */}
              <div className="hero-badges" style={{ marginTop: '8px' }}>
                <span className="hero-badge-pill">
                  <FontAwesomeIcon icon={faCheck} className="hero-badge-icon" />
                  {t('usedBy5000Doctors')}
                </span>
                <span className="hero-badge-pill">
                  <FontAwesomeIcon icon={faCheck} className="hero-badge-icon" />
                  {t('aiSpecializedInMedicine', 'IA especializada em Medicina')}
                </span>
                <span className="hero-badge-pill">
                  <FontAwesomeIcon icon={faCheck} className="hero-badge-icon" />
                  {t('evidenceBased', 'Baseado em Evidências')}
                </span>
              </div>

            </div>

            <div className="hero-scroll-fade"></div>
          </section>

          {/* USE CASES SECTION - Now first */}
          <section className="functionalities" id="casos-de-uso">
            <div className="section-light-effect"></div>
            <h2 className="scroll-animate">{t('useCases')}</h2>
            <div className="functionality-items-container">
              <div className="functionality-item scroll-animate" style={{ transitionDelay: '0.1s' }} onClick={() => openFeatureModal(t('consultationManagement'), (
                <div>
                  <h2>{t('consultationManagementSmart')}</h2>
                  <p>{t('consultationManagementOptimize')}</p>
                  <h3>{t('structuredAnamnesisAI')}</h3>
                  <p>{t('structuredAnamnesisAIDesc')}</p>
                  <h3>{t('diagnosticHypotheses')}</h3>
                  <p>{t('diagnosticHypothesesDesc')}</p>
                  <h3>{t('integratedElectronicPrescription')}</h3>
                  <p>{t('integratedElectronicPrescriptionDesc')}</p>
                  <button className="modal-cta-button" onClick={() => handleNavigate('/register')}>{t('tryConsultationManager')}</button>
                </div>
              ))}>
                <div className="item-glow"></div>
                <div className="functionality-icon">🩺</div>
                <p className="card-title">{t('consultationManagement')}</p>
                <p className="card-subtitle">{t('consultationManagementSubtitle')}</p>
              </div>
              <div className="functionality-item scroll-animate" style={{ transitionDelay: '0.2s' }} onClick={() => openFeatureModal(t('medicalCopilot'), (
                <div>
                  <h2>{t('copilotModalTitle')}</h2>
                  <p>{t('copilotModalIntro')}</p>
                  <h3>{t('copilotFeature1Title')}</h3>
                  <p>{t('copilotFeature1Desc')}</p>
                  <h3>{t('copilotFeature2Title')}</h3>
                  <p>{t('copilotFeature2Desc')}</p>
                  <h3>{t('copilotFeature3Title')}</h3>
                  <p>{t('copilotFeature3Desc')}</p>
                  <button className="modal-cta-button" onClick={() => handleNavigate('/register')}>{t('tryCopilot')}</button>
                </div>
              ))}>
                <div className="item-glow"></div>
                <div className="functionality-icon">🧠</div>
                <p className="card-title">{t('medicalCopilot')}</p>
                <p className="card-subtitle">{t('medicalCopilotSubtitle')}</p>
              </div>
              {getAdditionalFunctionalities(t).map((func, index) => (
                <div
                  key={func.id}
                  className="functionality-item scroll-animate"
                  style={{ transitionDelay: `${0.1 * (index + 4)}s` }}
                  onClick={() => openFeatureModal(func.modalTitle, func.modalContent)}
                >
                  <div className="item-glow"></div>
                  <div className="functionality-icon">{func.icon}</div>
                  <p className="card-title">{t(func.titleKey)}</p>
                  <p className="card-subtitle">{t(func.subtitleKey)}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="testimonials" id="comunidade">
            <div className="section-light-effect"></div>
            <h2 className="scroll-animate">{t('whatOurUsersSay')}</h2>
            <div className="testimonials-container">
              {testimonials.map((testimonial, index) => (
                <div
                  key={testimonial.id}
                  className="scroll-animate"
                  style={{ transitionDelay: `${0.1 * (index + 1)}s` }}
                >
                  <div className="testimonial floating-card">
                    <div className="testimonial-header">
                      <img src={testimonial.image} alt={testimonial.name} />
                      <div>
                        <h4>{testimonial.name}</h4>
                        <span>{testimonial.role}</span>
                        <p className="testimonial-institution">
                          {testimonial.institution}
                        </p>
                        <div style={{ color: '#FFD700' }}>{'⭐'.repeat(testimonial.rating)}</div>
                      </div>
                    </div>
                    <p>{testimonial.testimonial}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* BENCHMARK TEASER - After testimonials (social proof → scientific proof) */}
          <section className="benchmark-teaser scroll-animate" id="benchmark-teaser">
            <div className="benchmark-teaser-inner">
              <div className="benchmark-teaser-text">
                <span className="benchmark-teaser-eyebrow">
                  Pesquisa · TCC Faculdade de Medicina
                </span>
                <h2 className="benchmark-teaser-title">
                  Qython 1 vs. os principais LLMs em 8 especialidades médicas
                </h2>
                <p className="benchmark-teaser-lead">
                  Avaliação científica comparando Qython 1 com Claude Opus 4.7, GPT-5.5,
                  Gemini 3.5 Flash, Llama 4 Maverick e DeepSeek V4 sob rubrica de
                  especialistas e datasets validados (MedQA, Revalida, RSNA, NEJM Healer).
                  Coleta em andamento.
                </p>
                <div className="benchmark-teaser-actions">
                  <button className="cta cta-glow" onClick={() => handleNavigate('/benchmark')}>
                    Ver estudo completo →
                  </button>
                  <span className="benchmark-teaser-status">
                    <span className="benchmark-teaser-dot" />
                    Publicação prevista para Set/2026
                  </span>
                </div>
              </div>
              <div className="benchmark-teaser-visual" aria-hidden="true">
                <div className="benchmark-teaser-radar">
                  <svg viewBox="0 0 200 200" width="100%" height="100%">
                    <g transform="translate(100,100)">
                      {[20, 40, 60, 80].map((r) => (
                        <circle key={r} r={r} fill="none" stroke="rgba(187,134,252,0.15)" strokeWidth="1" />
                      ))}
                      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
                        const rad = (angle - 90) * Math.PI / 180;
                        const x = Math.cos(rad) * 80;
                        const y = Math.sin(rad) * 80;
                        return <line key={angle} x1="0" y1="0" x2={x} y2={y} stroke="rgba(187,134,252,0.18)" strokeWidth="1" />;
                      })}
                      <polygon
                        points={[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
                          const rad = (angle - 90) * Math.PI / 180;
                          const r = 50;
                          return `${Math.cos(rad) * r},${Math.sin(rad) * r}`;
                        }).join(' ')}
                        fill="rgba(3, 218, 198, 0.08)"
                        stroke="rgba(3, 218, 198, 0.5)"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                    </g>
                  </svg>
                  <div className="benchmark-teaser-radar-label">Em coleta</div>
                </div>
              </div>
            </div>
          </section>

          <section className="faq-section" id="faq">
            <h2 className="scroll-animate">{t('frequentlyAskedQuestions')}</h2>
            <FAQ data={faqData} />
          </section>

          <section className="pricing" id="planos">
            <div className="section-light-effect"></div>
            <h2 className="scroll-animate">{t('ourPlans')}</h2>
            <p className="pricing-subtitle scroll-animate">
              {t('pricingSubtitle', 'Comece sem cartão de crédito • Plano Estudante disponível')}
            </p>

            <div className="pricing-controls scroll-animate">

              {/* 1. Toggle Mensal/Anual */}
              <div className="pricing-toggle-wrapper">
                <span className={`toggle-label ${!isAnnual ? 'active-label' : ''}`} onClick={() => setIsAnnual(false)}>
                  {t('monthlyBilling')}
                </span>

                <button
                  className={`toggle-button ${isAnnual ? 'active' : ''}`}
                  onClick={() => setIsAnnual(!isAnnual)}
                  aria-label="Alternar período"
                >
                  <div className="toggle-handle"></div>
                </button>

                <div className="annual-label-wrapper" onClick={() => setIsAnnual(true)}>
                  <span className={`toggle-label ${isAnnual ? 'active-label' : ''}`}>
                    {t('annualBilling')}
                  </span>
                  <span className="discount-badge-floating">-20%</span>
                </div>
              </div>

              {/* 2. Seletor de Pagamento (Estilo Segmented Control) */}
              <div className="payment-method-selector">
                <button
                  className={`method-btn ${paymentMethod === 'stripe' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('stripe')}
                >
                  <FontAwesomeIcon icon={faCreditCard} /> {t('payWithCardShort')}
                </button>
                <button
                  className={`method-btn ${paymentMethod === 'binance' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('binance')}
                >
                  <FontAwesomeIcon icon={faBtc} /> {t('payWithCryptoShort')}
                </button>
                <div className={`selector-slider ${paymentMethod === 'binance' ? 'slide-right' : ''}`}></div>
              </div>

            </div>

            <div className="pricing-container">
              {plans.map((plan) => (
                <div
                  key={plan.key}
                  className={`
                    pricing-tier scroll-animate 
                    ${plan.highlight ? 'popular' : ''} 
                    ${plan.isEnterprise ? 'enterprise-card' : ''}
                  `}
                >
                  {plan.highlight && <div className="popular-badge">{t('recommended')}</div>}

                  {plan.isEnterprise && <FontAwesomeIcon icon={faBuilding} className="enterprise-icon" />}

                  <h3>{plan.name}</h3>

                  <div className="price-container">
                    <span className="price">
                      {plan.basePrice !== null ? formatPrice(plan.basePrice) : plan.price}
                    </span>
                    {plan.basePrice !== null && <span className="period">{plan.period}</span>}
                  </div>

                  {isAnnual && plan.basePrice !== null && (
                    <p className="annual-total">Cobrado anualmente</p>
                  )}

                  <div className="dracmas-info">
                    <div className="dracmas-header">
                      <FontAwesomeIcon icon={faGem} className="dracma-icon" />
                      <span className="dracmas-amount">{plan.dracmas}</span>
                    </div>
                    <span className="dracmas-label">
                      {plan.isEnterprise ? '' : t('dracmas') + ' ' + t('monthly')}
                    </span>
                  </div>

                  <div className="divider"></div>

                  <ul>
                    {plan.features.map((feature, i) => (
                      <li key={i} className={!feature.included ? 'feature-disabled' : ''}>
                        <div className="icon-wrapper">
                          <FontAwesomeIcon
                            icon={feature.included ? faCheck : faTimes}
                            className={feature.included ? 'icon-check' : 'icon-times'}
                          />
                        </div>
                        <span className="feature-text">
                          {feature.name}
                          {feature.note && <span className="feature-note"> {feature.note}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="action-container">
                    <button
                      className={`cta ${plan.highlight ? 'cta-featured' : ''} ${plan.isEnterprise ? 'cta-enterprise' : ''} ${isCurrentPlan(plan.key) ? 'cta-current-plan' : ''}`}
                      onClick={isCurrentPlan(plan.key) ? undefined : plan.action}
                      disabled={isCurrentPlan(plan.key)}
                    >
                      {isCurrentPlan(plan.key) ? t('currentPlan', 'Plano Atual') : plan.cta}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <footer>
            <div className="footer-container">
              <div className="footer-column footer-about">
                <div className="footer-logo">
                  <img src={qythonLogo} alt="Qython" className="footer-logo-img-full" />
                </div>
                <p className="footer-tagline">{t('footerTagline')}</p>
                <p className="footer-copyright">© 2026 Qython. {t('allRightsReserved')}</p>
              </div>

              <div className="footer-column">
                <h4>{t('product')}</h4>
                <ul>
                  {/* LINKS DO FOOTER ATUALIZADOS COM SCROLL SUAVE */}
                  <li><a href="#casos-de-uso" onClick={(e) => scrollToSection(e, 'casos-de-uso')}>{t('features')}</a></li>
                  <li><a href="#planos" onClick={(e) => scrollToSection(e, 'planos')}>{t('pricing')}</a></li>
                  <li><a href="#comunidade" onClick={(e) => scrollToSection(e, 'comunidade')}>{t('community')}</a></li>
                </ul>
              </div>

              <div className="footer-column">
                <h4>{t('company')}</h4>
                <ul>
                  <li><a href="/careers">{t('careers')}</a></li>
                  <li><a href="/contact">{t('contact')}</a></li>
                </ul>
              </div>

              <div className="footer-column">
                <h4>{t('legal')}</h4>
                <ul>
                  <li><Link to="/terms-of-use">{t('termsOfUse')}</Link></li>
                  <li><Link to="/privacy-policy">{t('privacyPolicy')}</Link></li>
                  <li><Link to="/encarregado">{t('dpoLink')}</Link></li>
                  <li><Link to="/subprocessors">{t('subprocessorsLink')}</Link></li>
                  <li><Link to="/paciente">{t('patientNoticeLink')}</Link></li>
                </ul>
                <div className="footer-social">
                  <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                    <FaLinkedin />
                  </a>
                  <a href="https://x.com" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)">
                    <FaXTwitter />
                  </a>
                  <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                    <FaInstagram />
                  </a>
                  <a href="https://tiktok.com" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
                    <FaTiktok />
                  </a>
                  <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
                    <FaYoutube />
                  </a>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>

      <FeatureModal
        isOpen={isModalOpen}
        onClose={closeFeatureModal}
        title={modalContent.title}
        content={modalContent.content}
      />

      <ComingSoonModal
        isOpen={showComingSoonModal}
        onClose={() => setShowComingSoonModal(false)}
        userEmail={user?.email}
      />
    </>
  );
}

export default LandingPage;
