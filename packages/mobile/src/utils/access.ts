// Acesso às features de IA (copiloto, materiais, consultas).
//
// VERIFICAÇÃO (Latreo) e ACESSO (Qython) são coisas DIFERENTES:
//  - `verification_status === 'verified'` é a verdade do Latreo. O Qython nunca a forja.
//  - `access_granted` é a política do Qython: "este usuário pode usar a plataforma",
//    concedida pelo admin (ou aberta a todos no futuro) SEM afirmar verificação Latreo.
//
// Espelha packages/web/src/utils/access.js.
interface AccessUser {
  is_admin?: boolean;
  verification_status?: string | null;
  access_granted?: boolean;
}

export function hasPlatformAccess(user: AccessUser | null | undefined): boolean {
  if (!user) return false;
  return Boolean(
    user.is_admin ||
    user.verification_status === 'verified' ||
    user.access_granted,
  );
}
