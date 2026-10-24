# Qython Mobile

App React Native 0.84 (bare, New Architecture) que conversa com o servidor
Qython do próprio usuário. Não existe servidor central: o endereço é informado
na tela de login.

## Build local

As dependências ficam no `node_modules` da raiz do monorepo (npm workspaces);
`packages/mobile/node_modules` não existe e o Gradle já aponta para a raiz.

Requisitos: Node 22, JDK 17, Android SDK 36, NDK 27.1.12297006.

```bash
npm ci                                   # na raiz do repositório
cd packages/mobile/android
./gradlew assembleDebug                  # APK de debug, JS servido pelo Metro
```

Para rodar com Metro: `npm run start --workspace=packages/mobile` e, em outro
terminal, `npm run android --workspace=packages/mobile`.

## Servidor

Na tela de login, o campo **Servidor** recebe o endereço do backend, por
exemplo `http://192.168.0.10:8080` (sem esquema, assume `http://`). **Testar
conexão** faz `GET <servidor>/api/health` e espera `{"status":"ok"}`. O valor
fica salvo no aparelho (MMKV); trocar de servidor encerra a sessão.

Builds de debug começam apontando para `http://10.0.2.2:8000` (o host visto do
emulador). O release aceita HTTP porque o servidor costuma estar na rede local
sem TLS; também aceita certificados instalados pelo usuário, para quem servir
HTTPS com uma CA própria.

## Firebase (opcional)

Login com Google e push dependem do Firebase, que não vem no repositório. Sem
os arquivos abaixo o app compila e funciona normalmente; o botão do Google
some e o app não pede permissão de notificação.

- Android: `android/app/google-services.json`
- iOS: `ios/QythonMobile/GoogleService-Info.plist`

Ambos estão no `.gitignore`.

## Release assinado

O release nunca usa a chave de debug (`android/app/debug.keystore` é pública).
Sem keystore, `assembleRelease` falha antes de compilar, dizendo o que falta.

Gerar o keystore, uma vez (guarde o arquivo e a senha fora do repositório:
sem eles, nenhuma versão futura instala por cima da anterior):

```bash
keytool -genkeypair -v -keystore qython-release.keystore -storetype PKCS12 -alias qython -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Qython"
```

Build local assinado (variáveis de ambiente ou `~/.gradle/gradle.properties`):

| Variável | Conteúdo |
|---|---|
| `QYTHON_RELEASE_STORE_FILE` | caminho do keystore |
| `QYTHON_RELEASE_STORE_PASSWORD` | senha do keystore |
| `QYTHON_RELEASE_KEY_ALIAS` | alias da chave (`qython` no comando acima) |
| `QYTHON_RELEASE_KEY_PASSWORD` | opcional; padrão = senha do keystore |

```bash
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

### No GitHub Actions

O workflow `.github/workflows/mobile.yml` roda à mão (**Actions → Mobile → Run
workflow**) e em tags `v*`. Gera o APK como artifact e, numa tag, anexa à
release da tag quando ela existir. Secrets do repositório
(**Settings → Secrets and variables → Actions**):

| Secret | Conteúdo |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 qython-release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | senha do keystore |
| `ANDROID_KEY_ALIAS` | alias da chave |
| `ANDROID_KEY_PASSWORD` | opcional; só se diferente da senha do keystore |

O resumo de cada execução mostra o SHA-256 do certificado e do APK, para quem
baixa conferir que o arquivo é o oficial.
