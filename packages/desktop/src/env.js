// O ambiente dos processos filhos (backend, Chroma, llama-server, Postgres).
//
// Eles NÃO herdam o ambiente do computador do médico: herdar seria deixar uma variável solta
// (LLM_BASE_URL de um teste antigo, DATABASE_URL de outro projeto, PGPASSWORD) decidir para onde
// o texto clínico vai. O backend lê o endereço da IA e o banco pelo ambiente: um valor herdado
// mandaria as perguntas para um servidor que ninguém escolheu. Só passa o que o sistema
// operacional e a rede precisam; o resto o app define.
const EXACT = new Set([
  'PATH', 'PATHEXT', 'HOME', 'USER', 'USERNAME', 'LOGNAME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'COMMONPROGRAMFILES',
  'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'OS', 'COMPUTERNAME', 'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LANGUAGE', 'TZ', 'SHELL', 'DISPLAY',
  // Rede de hospital: proxy e autoridades certificadoras da instituição.
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'NODE_EXTRA_CA_CERTS',
]);
const PREFIXES = ['LC_', 'XDG_'];

export function baseEnv(source = process.env) {
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    const upper = key.toUpperCase();
    if (EXACT.has(upper) || PREFIXES.some((p) => upper.startsWith(p))) out[key] = value;
  }
  return out;
}
