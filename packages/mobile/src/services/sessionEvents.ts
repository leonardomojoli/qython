// Avisa o app quando a sessão acabou (acesso recusado, aparelho removido no computador), para ele
// voltar à tela de entrada. Fica à parte do api.ts para não criar importação circular.
type Listener = () => void;
const listeners = new Set<Listener>();

export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitSessionExpired(): void {
  listeners.forEach(listener => listener());
}

// O api.ts zera a sessão quando o endereço do servidor muda, em segundo plano. Quem grava uma sessão
// nova logo depois de mudar o endereço (o pareamento) espera esse término, senão a limpeza apaga a
// sessão recém-gravada.
let pendingReset: Promise<void> = Promise.resolve();

export function setPendingReset(promise: Promise<void>): void {
  pendingReset = promise.catch(() => {});
}

export function waitForPendingReset(): Promise<void> {
  return pendingReset;
}
