import { useState, useEffect } from 'react';
import { API_URL as API_BASE_URL } from '../config';

// Lê os toggles públicos de gateway de pagamento (GET /admin/settings/public, sem auth).
// Os componentes de billing usam isso p/ decidir entre o checkout real e o "Em breve".
// dLocal vem OFF por padrão até as chaves existirem + validação no sandbox (admin liga no painel).
export default function usePaymentGateways() {
  const [gateways, setGateways] = useState({ dlocal: false, binance: false, stripe: false });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/admin/settings/public`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (!active) return;
        setGateways({
          dlocal: !!data.payment_gateway_dlocal_enabled,
          binance: !!data.payment_gateway_binance_enabled,
          stripe: !!data.payment_gateway_stripe_enabled,
        });
        setReady(true);
      })
      .catch(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  // Gateways de cartão/PIX/cripto disponíveis hoje (Stripe está fora — sem conta no Uruguai).
  const anyEnabled = gateways.dlocal || gateways.binance;
  return { gateways, anyEnabled, ready };
}
