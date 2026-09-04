# Mobile Deep Links — Handoff Steps

Status: **infraestrutura pronta, placeholders no código aguardando valores reais**.

A migração para `qython.ai` deixou tudo do lado backend/nginx pronto pra deep links funcionarem em **iOS Universal Links** e **Android App Links**. Falta apenas:

1. Preencher 2 placeholders nos arquivos `.well-known/`
2. Rebuild dos apps com novo bundle ID / package ID
3. Re-distribuir (TestFlight + Play Store internal)

## Bundle ID / Package ID

Novo identifier (igual nas duas plataformas):

```
ai.qython.app
```

| Plataforma | Localização | Estado |
|------------|-------------|--------|
| iOS | `packages/mobile/ios/QythonMobile.xcodeproj/project.pbxproj` (`PRODUCT_BUNDLE_IDENTIFIER`) | ✅ Atualizado |
| Android | `packages/mobile/android/app/build.gradle` (`namespace` + `applicationId`) | ✅ Atualizado |
| Android | `packages/mobile/android/app/src/main/java/ai/qython/app/` (Kotlin files moved) | ✅ Atualizado |

## Passo 1 — Pegar o Apple Team ID

1. Logar em https://developer.apple.com/account
2. **Membership** → procurar "Team ID" (10 caracteres alfanuméricos, ex: `A1B2C3D4E5`)
3. Substituir no arquivo:

   `packages/web/public/.well-known/apple-app-site-association`:
   ```json
   "appID": "REPLACE_WITH_TEAM_ID.ai.qython.app"
   ```
   por:
   ```json
   "appID": "A1B2C3D4E5.ai.qython.app"
   ```

## Passo 2 — Pegar o SHA-256 da keystore Android

### Para release (Play Store):
```bash
keytool -list -v \
  -keystore /caminho/para/release.keystore \
  -alias <alias-da-chave> \
  -storepass <senha> \
  -keypass <senha>
```

Procurar a linha **`SHA-256:`** — formato `XX:XX:XX:...` (32 bytes, 64 hex chars com `:` entre cada par).

### Para debug (testar local):
```bash
keytool -list -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -storepass android \
  -keypass android | grep SHA-256
```

Substituir no arquivo:

`packages/web/public/.well-known/assetlinks.json`:
```json
"sha256_cert_fingerprints": [
  "REPLACE_WITH_RELEASE_SHA256_FINGERPRINT_FROM_KEYSTORE"
]
```

por (exemplo):
```json
"sha256_cert_fingerprints": [
  "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5"
]
```

**Dica:** se tiver debug + release, pode colocar os 2 hashes no array (suporta múltiplos).

## Passo 3 — Deploy dos arquivos `.well-known/`

Os arquivos ficam em `packages/web/public/.well-known/` — o Vite copia para `build/.well-known/` automaticamente no `npm run build`. Nginx já está configurado para servir esses paths em `qython.ai` e `qython.app`.

Após preencher os placeholders:

```bash
git commit -am "feat(mobile): fill assetlinks/AASA with real fingerprints"
git push origin master

# No servidor (via MCP server_deploy_full ou manual)
# Rebuild do frontend incorpora .well-known/ na pasta build/
```

Validar:
```bash
curl https://qython.ai/.well-known/assetlinks.json
curl https://qython.ai/.well-known/apple-app-site-association
curl https://qython.app/.well-known/assetlinks.json
curl https://qython.app/.well-known/apple-app-site-association
```

Todos devem retornar 200 com Content-Type `application/json`.

## Passo 4 — Rebuild iOS (Xcode)

1. Abrir Xcode → `packages/mobile/ios/QythonMobile.xcworkspace`
2. Selecionar target "QythonMobile" → Signing & Capabilities
3. Verificar:
   - Bundle Identifier: `ai.qython.app` ✓
   - Team: selecionar seu time (auto)
   - Associated Domains: já tem `applinks:qython.ai` e `applinks:qython.app` no `QythonMobile.entitlements` ✓
4. Product → Archive → distribuir via TestFlight

**Testar Universal Links após distribuir:**
- No iPhone com app instalado, abrir um SMS/email com link `https://qython.ai/receita/abc` → deve abrir no app
- Sem app instalado, mesmo link → abre no Safari → mostra a página web

## Passo 5 — Rebuild Android (Android Studio ou CLI)

```bash
cd packages/mobile/android
./gradlew clean
./gradlew bundleRelease  # gera .aab pra Play Store
# ou ./gradlew assembleRelease  # gera .apk pra teste
```

**Verificar autoVerify funcionou:**
```bash
adb install path/to/your.apk
adb shell pm verify-app-links --re-verify ai.qython.app
adb shell pm get-app-links ai.qython.app
```

Output esperado: `qython.ai: verified`, `qython.app: verified`. Se aparecer `domain_verification_state: 1024` (legacy/none), é porque o servidor não está retornando o `assetlinks.json` certo — verificar Passo 3.

## Troubleshooting

| Sintoma | Causa provável |
|---------|----------------|
| Universal Link iOS não abre no app | `apple-app-site-association` não acessível ou Team ID errado |
| App Link Android não verifica | `sha256_cert_fingerprints` incorreto ou cache do verifier (rodar `pm verify-app-links --re-verify`) |
| Link abre no browser ao invés do app | App não instalado, OU iOS já tem usuário rejeitado o universal link uma vez (precisa reinstalar) |
| `curl /.well-known/assetlinks.json` retorna 404 | Frontend não foi rebuildado, ou o public dir não foi incluído. Rodar `npm run build` em packages/web/ |

## Estado atual (commits relacionados)

- `e6cbba22` — Merge: URL config unificado para qython.ai
- `f6e7760d` — Docs cleanup (LICENSE, README, translations, etc.)
- `8a2ee464` — Bundle ID / package ID `ai.qython.app` + .well-known/ placeholders servidos em produção
