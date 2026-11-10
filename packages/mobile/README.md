# Qython Mobile

App React Native 0.84 (bare, New Architecture) que conversa com o servidor
Qython do próprio usuário. Não existe servidor central: o endereço é informado
na tela de login.

## Build local

As dependências ficam no `node_modules` da raiz do monorepo (npm workspaces);
só o que conflita com a versão usada pelo web fica em
`packages/mobile/node_modules`. `react-native` e o plugin Gradle precisam
estar na raiz, e é para lá que o Gradle aponta.

Requisitos: Node 22, JDK 17, Android SDK 37, NDK 27.1.12297006.

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

## Pareamento com o computador (QR code)

O caminho recomendado para usar o Qython do computador: na tela de login, **Parear com o computador**.
No computador, *Perfil → Configurações → Conectar o celular* mostra um QR code; o celular o lê (leitor do
Google Play Services, sem permissão de câmera) ou aceita endereço e código digitados, caso em que o
médico confere a impressão digital do certificado com a tela do computador. Contrato completo em
[`docs/PAREAMENTO.md`](../../docs/PAREAMENTO.md).

O que há de nativo (Android, `android/app/src/main/java/ai/qython/app/`):

- `PinnedTls.kt`: o computador fala HTTPS com certificado autoassinado. Para cada servidor pareado o app
  guarda `host:porta → impressão digital (SHA-256)` e só aceita EXATAMENTE aquele certificado (inclusive
  contra um certificado válido de outra autoridade); os demais endereços seguem a validação do sistema.
  Vale para o fetch/axios, os WebSockets e as imagens do React Native (fábrica de OkHttp em
  `MainApplication.kt`) e é carregado de um arquivo antes de a primeira requisição sair.
- `SecureStore.kt`: o acesso da conta e o segredo do aparelho ficam cifrados com uma chave AES-GCM do
  Android Keystore (antes o JWT ficava em texto no AsyncStorage; um token antigo é movido na primeira leitura).
- `QythonSecurityModule.kt`: a ponte para tudo isso, `probeFingerprint` (pareamento digitado) e `scanQrCode`.

No JavaScript: `services/pairingProtocol.ts` (QR code, código, impressão digital; puro e testado),
`services/pairing.ts` (parear, renovar o acesso pelo segredo do aparelho, desparear) e os interceptores de
`services/api.ts` (um 401 renova o acesso uma vez e repete a chamada; aparelho removido no computador
encerra a sessão). O teste "online" do NetInfo passou a ser o `/api/health` do servidor configurado, não a
internet: o computador pode estar numa rede de Wi-Fi sem saída para fora.

Limites atuais: só Android (no iOS o pareamento não tem fixação de certificado nem leitor de QR code); se o
computador trocar de IP, parear de novo (ou digitar o endereço novo); PDF e anexos passam pela mesma
pilha de rede do app.

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

### A chave oficial

O keystore de release é a identidade permanente do app. O Android só instala
uma atualização por cima da versão anterior se as duas tiverem sido assinadas
com a mesma chave. Se o arquivo ou a senha se perderem, nenhuma versão futura
instala por cima das que já foram distribuídas: quem usa o app teria de
desinstalá-lo (perdendo os dados locais) e instalar de novo. Gere a chave uma
vez só, faça backup e nunca a coloque no repositório.

Gerar (o `keytool` pede a senha no terminal; em PKCS12 a senha da chave é a
mesma do keystore):

```bash
keytool -genkeypair -v -keystore qython-release.keystore -storetype PKCS12 -alias qython -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Qython"
```

Backup: copie `qython-release.keystore` para fora do repositório (um pendrive
guardado e/ou um gerenciador de senhas que aceite anexos) e guarde a senha no
gerenciador de senhas. Confira que o backup abre:

```bash
keytool -list -keystore qython-release.keystore
```

Cadastrar no GitHub. Cada `gh secret set` sem `--body` lê o valor do
terminal, então a senha não fica no histórico do shell:

```bash
base64 -w0 qython-release.keystore | gh secret set ANDROID_KEYSTORE_BASE64 --repo leonardomojoli/qython
gh secret set ANDROID_KEYSTORE_PASSWORD --repo leonardomojoli/qython
gh secret set ANDROID_KEY_ALIAS --repo leonardomojoli/qython --body qython
gh secret set ANDROID_KEY_PASSWORD --repo leonardomojoli/qython
```

`ANDROID_KEY_PASSWORD` recebe a mesma senha do keystore. Depois de conferir o
backup, apague a cópia local que não for o backup.

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

O workflow `.github/workflows/mobile.yml` roda em tags `v*`, à mão (**Actions →
Mobile → Run workflow**) e em pull requests que mexem no mobile:

- **Tag `v*`:** assina com a chave oficial, que vem dos secrets acima. Sem
  eles, falha dizendo quais faltam. O APK sai como artifact e é anexado à
  release da tag quando ela existir.
- **Manual e pull request:** assina com uma chave descartável gerada no
  próprio job. O APK (`qython-dev-<commit>-verificacao-NAO-OFICIAL.apk`) só
  prova que o app compila e empacota. Não é uma versão oficial e não instala
  por cima de uma, porque a assinatura é outra.

O resumo de cada execução mostra pacote, versão e SHA-256 do certificado e do
APK, para quem baixa conferir se o arquivo é o oficial.
