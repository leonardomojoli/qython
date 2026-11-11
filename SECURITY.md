# Segurança

O Qython guarda dados clínicos, então relatos de vulnerabilidade são levados a sério.

## Como reportar

**Não abra uma issue pública.** Use o relato privado do GitHub: na página do repositório,
**Security → Report a vulnerability**. Descreva o que encontrou, como reproduzir e qual o impacto.
Evite colocar dados reais de pacientes no relato.

## O que esperar

- Confirmamos o recebimento em até 7 dias.
- Corrigimos primeiro e divulgamos depois: o detalhe só vira público com a correção disponível.
- Quem reporta é creditado no aviso, se quiser.

## Escopo

Vale para o app desktop, o servidor (Docker), o app Android e o backend. O que nos interessa, em ordem:
acesso a dados de outro usuário, execução de código, vazamento de chaves ou de dados fora da máquina
(o Qython promete que nada sai dela), e fraquezas no pareamento do celular com o computador
(`docs/PAREAMENTO.md`).

## Versões com correção

Corrigimos a versão mais recente. Mantenha o Qython atualizado: o app desktop avisa quando há versão nova.
