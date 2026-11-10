# Pareamento do celular com o Qython

O app Android conversa com o Qython do computador (ou do servidor da instituição) depois de um
**pareamento**: o médico escaneia um QR code mostrado na tela do computador, e o celular passa a
usar a conta dele sem digitar endereço nem senha. Este documento é o contrato entre o backend, o
app desktop e o app do celular. O código está em `backend/services/pairing_service.py`,
`backend/routes/pairing_routes.py`, `packages/desktop/src/lan.js` e `packages/mobile`.

## O fluxo

```
computador (logado)                         celular
  POST /api/pairing/start  ──▶ código de uso único (8 caracteres, 5 minutos)
  mostra o QR code {endereços, impressão digital do certificado, código}
                                              escaneia (ou digita endereço e código)
                              ◀── POST /api/pairing/claim  {código, nome do aparelho}
                                  segredo do aparelho + acesso curto
                                              guarda o segredo no cofre do Android
                              ◀── POST /api/pairing/token  {segredo}   (a cada ~hora)
                                  novo acesso curto
  GET  /api/pairing/devices  ──▶ lista os aparelhos
  DELETE /api/pairing/devices/{id} ──▶ revoga: o aparelho perde o acesso na hora
```

## O que cada peça garante

- **Código:** 8 caracteres de um alfabeto de 32 (sem 0, O, 1, I), 40 bits, válido por 5 minutos,
  de uso único, um por usuário (gerar outro apaga o anterior). Só o hash (SHA-256) vai ao banco. As
  rotas `claim` e `token` têm limite de tentativas por origem.
- **Segredo do aparelho:** 32 bytes aleatórios, mostrado **uma vez** na resposta do `claim`. O banco
  guarda só o hash. Quem o perde pareia de novo.
- **Acesso:** o mesmo JWT que o login emite, mas com 60 minutos de vida (`PAIRED_ACCESS_TOKEN_MINUTES`)
  e a claim `device_id`. A cada requisição o backend confere que o aparelho não foi revogado, então
  **revogar corta o acesso que o aparelho já tinha, não só a renovação**, sem mexer na senha.
- **Conta:** só contas `active` pareiam ou renovam; conta banida perde o celular junto.
- **Auditoria:** `pairing.code.created`, `pairing.claim.failed`, `pairing.device.created` e
  `pairing.device.revoked` vão para o log de auditoria.

## QR code

JSON em UTF-8, escrito no QR code:

```json
{"t": "qython-pair", "v": 1,
 "a": ["https://192.168.0.10:8443", "https://10.0.0.5:8443"],
 "f": "<SHA-256 do certificado em hexadecimal minúsculo, 64 caracteres>",
 "c": "ABCDEFGH"}
```

`a` são os endereços do computador na rede local, na ordem em que o celular os tenta. `f` é a
impressão digital do certificado TLS autoassinado do computador; **o celular só aceita o
certificado que tiver exatamente essa impressão digital** (ver abaixo). `f` é `null` quando o
servidor tem um certificado de uma autoridade pública (servidor com HTTPS de verdade): aí vale a
validação normal.

## TLS e a impressão digital

O app desktop só abre a porta da rede local quando o médico liga "Permitir o celular nesta rede".
Ela fala HTTPS com um certificado autoassinado, gerado uma vez por instalação (a chave privada fica
no cofre do sistema). Como ninguém de fora assina esse certificado, o que impede um intruso na rede
de se passar pelo computador é a **impressão digital no QR code**: o médico a leva da tela do
computador ao celular pela câmera, fora da rede. O celular recusa qualquer certificado diferente
dela, inclusive um válido de outra autoridade.

A porta da rede local não serve o app web nem as rotas de login por senha: só `claim`, `token`,
`health` e a API com o acesso do aparelho. Gerar código e administrar aparelhos só vale pela
própria janela do computador.
