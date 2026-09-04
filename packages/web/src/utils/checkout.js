import { api } from '../api';

// Domínios de checkout autorizados p/ redirect (anti open-redirect). Inclui dLocal Go
// (prod + sandbox) além de Stripe/Binance legados.
export const ALLOWED_PAYMENT_DOMAINS = [
  'checkout.stripe.com',
  'pay.binance.com',
  'www.binance.com',
  'checkout.dlocalgo.com',
  'checkout-sbx.dlocalgo.com',
];

function isAllowedPaymentUrl(url) {
  try {
    const u = new URL(url);
    // Match exato de host ou subdomínio (evita 'evilcheckout.stripe.com').
    return ALLOWED_PAYMENT_DOMAINS.some(
      (d) => u.hostname === d || u.hostname.endsWith('.' + d)
    );
  } catch (_) {
    return false;
  }
}

// Cria a sessão de checkout no backend e redireciona o navegador.
// Lança Error em falha (o caller mostra a notificação). payload:
//   { packId, provider, type } (avulso) | { planKey, interval, provider } (assinatura)
export async function redirectToCheckout(payload) {
  const response = await api.post('/billing/create-checkout-session', payload);
  const url = response?.data?.url;
  if (!url) throw new Error('no_checkout_url');
  if (!isAllowedPaymentUrl(url)) throw new Error('unauthorized_payment_domain');
  window.location.href = url;
}
