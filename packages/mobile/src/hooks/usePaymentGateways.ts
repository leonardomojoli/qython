import { useState, useEffect } from 'react';
import api from '../services/api';

// Lê os toggles públicos de gateway (GET /admin/settings/public). dLocal vem OFF por padrão
// até as chaves existirem + validação no sandbox. Os modais de billing usam isso p/ decidir
// entre o checkout real e o "Em breve". (Paridade com o hook do web.)
export default function usePaymentGateways() {
  const [gateways, setGateways] = useState({ dlocal: false, binance: false });

  useEffect(() => {
    let active = true;
    api
      .get('/admin/settings/public')
      .then((res) => {
        if (!active) return;
        const d = res?.data || {};
        setGateways({
          dlocal: !!d.payment_gateway_dlocal_enabled,
          binance: !!d.payment_gateway_binance_enabled,
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const anyEnabled = gateways.dlocal || gateways.binance;
  const provider: 'dlocal' | 'binance' = gateways.dlocal ? 'dlocal' : gateways.binance ? 'binance' : 'dlocal';
  return { gateways, anyEnabled, provider };
}
