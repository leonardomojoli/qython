import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseEnv } from '../src/env.js';

test('o ambiente dos processos filhos não herda chaves nem configuração solta do computador', () => {
  const env = baseEnv({
    PATH: '/usr/bin', HOME: '/home/m', LANG: 'pt_BR.UTF-8', LC_ALL: 'pt_BR.UTF-8', XDG_RUNTIME_DIR: '/run/user/1000',
    HTTPS_PROXY: 'http://proxy:3128', SSL_CERT_FILE: '/etc/ssl/ca.pem', SystemRoot: 'C:\\Windows', Temp: 'C:\\Temp',
    // O que NÃO pode passar:
    LLM_API_KEY: 'solta', LLM_MODEL: 'outro', LLM_BASE_URL: 'http://outro', DATABASE_URL: 'postgresql://x',
    JWT_SECRET_KEY: 'x', QYTHON_FIELD_KEK: 'k', PGPASSWORD: 'p', PGHOST: 'h', OPENAI_API_KEY: 'sk', GROQ_API_KEY: 'g',
    ANONYMIZED_TELEMETRY: 'True', CHROMA_SERVER_HOST: 'h', ALLOWED_HOSTS: '*', WHISPER_SERVER_URL: 'http://x',
  });
  assert.deepEqual(Object.keys(env).sort(), ['HOME', 'HTTPS_PROXY', 'LANG', 'LC_ALL', 'PATH', 'SSL_CERT_FILE', 'SystemRoot', 'Temp', 'XDG_RUNTIME_DIR']);
});

test('no Windows os nomes vêm em qualquer caixa', () => {
  const env = baseEnv({ Path: 'C:\\x', SYSTEMROOT: 'C:\\Windows', llm_api_key: 'z' });
  assert.ok('Path' in env && 'SYSTEMROOT' in env);
  assert.ok(!('llm_api_key' in env));
});
