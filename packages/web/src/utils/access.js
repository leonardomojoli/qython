// Acesso às features de IA (copiloto, materiais, consultas).
//
// VERIFICAÇÃO (Latreo) e ACESSO (Qython) são coisas DIFERENTES:
//  - `verification_status === 'verified'` é a verdade do Latreo: "esta identidade
//    médica/estudantil foi verificada". O Qython nunca forja esse valor.
//  - `access_granted` é a política do Qython: "este usuário pode usar a plataforma",
//    concedida pelo admin (ou aberta a todos no futuro) SEM afirmar que é Latreo-
//    verificado.
//
// Um usuário tem acesso se for admin, OU Latreo-verificado, OU teve acesso concedido.
export function hasPlatformAccess(user) {
  if (!user) return false;
  return Boolean(
    user.is_admin ||
    user.verification_status === 'verified' ||
    user.access_granted
  );
}
