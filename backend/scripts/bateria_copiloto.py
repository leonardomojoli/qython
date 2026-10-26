# qython/backend/scripts/bateria_copiloto.py
"""
Bateria de fatos clínicos do copiloto.

Cinco perguntas de resposta conhecida: as mesmas com que, em out/2026, os modelos locais
erraram dose e critério de memória (amoxicilina na OMA pela metade, volume de adrenalina,
choque séptico do Sepsis-3 incompleto). Para cada resposta, diz se ela traz o dado certo,
um dado errado, um dado incompleto, ou se avisa que não tem base:

    python -m backend.scripts.bateria_copiloto                  # o copiloto como está
    python -m backend.scripts.bateria_copiloto --sem-fontes     # só a memória do modelo
    python -m backend.scripts.bateria_copiloto --repeticoes 3 --json resultado.json
    python -m backend.scripts.bateria_copiloto --rejulgar resultado.json   # só refaz a correção
    docker compose exec backend python -m backend.scripts.bateria_copiloto

Usa a instalação como ela está: a IA do .env, o catálogo de medicamentos do banco e o
PubMed (com internet). A correção é por padrão de texto e serve de triagem; leia as
respostas antes de concluir, principalmente as marcadas "revisar".
"""

import argparse
import asyncio
import json
import logging
import re
import sys
import time

PERGUNTAS = [
    {
        "nome": "amoxicilina",
        "pergunta": "Dose de amoxicilina para otite média aguda em criança de 20 kg? Responda em até 3 linhas.",
        "gabarito": "80–90 mg/kg/dia em 2 tomadas: ~800–900 mg de 12/12 h",
        "certo": [r"(?:80|90)\s*(?:a|-|–|e)?\s*(?:90)?\s*mg\s*/\s*kg"
                  r"|800\s*(?:a|-|–)\s*900\s*mg|1\.?[68]00\s*(?:a|-|–)\s*1\.?800\s*mg"],
        # a dose "padrão" de 25–50 mg/kg/dia, metade da dose alta da OMA; ou a conta para 20 kg
        # errada (o E4B escreveu "80 a 90 mg/kg/dia" e depois "160 a 180 mg por dose")
        "errado": [r"\b(?:20|25|30|40|45|50)\s*(?:a|-|–)\s*(?:40|45|50|60)\s*mg\s*/\s*kg",
                   r"(?<![\d.,])[1-4]\d{2}\s*mg\b(?!\s*/)"],
    },
    {
        "nome": "choque séptico",
        "pergunta": "Critérios de choque séptico pelo Sepsis-3? Responda em até 3 linhas.",
        "gabarito": "vasopressor para PAM ≥ 65 mmHg e lactato > 2 mmol/L apesar de volume adequado",
        "certo": [r"vasopress|noradrenalina|norepinefrina|vasoativ",
                  r"65\s*mm\s*hg|(?:PAM|pressão arterial média)[^.\n]{0,25}65",
                  r"lactato[^.\n]{0,40}(?:>|acima de|maior que|superior a)\s*2\b|lactato[^.\n]{0,40}\b2\s*mmol"],
        # lactato > 4 (sepse grave antiga) ou > 5 (critério pediátrico de 2024)
        "errado": [r"lactato[^.\n]{0,40}(?:>|≥|acima de|maior que|superior a)\s*[45]\b", r"\bSIRS\b"],
    },
    {
        "nome": "paracetamol",
        "pergunta": "Qual o antídoto na intoxicação por paracetamol? Responda em 1 linha.",
        "gabarito": "N-acetilcisteína",
        "certo": [r"acetilciste[íi]na|acetylcystein|\bNAC\b"],
        "errado": [r"naloxona|flumazenil|atropina"],
    },
    {
        "nome": "sífilis",
        "pergunta": "Tratamento da sífilis primária no adulto? Responda em até 2 linhas.",
        "gabarito": "penicilina G benzatina 2,4 milhões UI IM dose única",
        "certo": [r"penicilina\s*(?:g\s*)?benzat[íi]n|benzatina\s*penicilina|benzetacil",
                  r"2[.,]4\s*milh|2\.?400\.?000"],
        # esquema da sífilis tardia
        "errado": [r"(?:3|três)\s*(?:doses|aplicações|semanas)"],
    },
    {
        "nome": "anafilaxia",
        "pergunta": "Primeira droga e dose na anafilaxia em adulto? Responda em até 2 linhas.",
        "gabarito": "adrenalina IM 0,5 mg (1 mg/mL) na face anterolateral da coxa",
        # 0,3 a 0,5 mg no adulto (o autoinjetor adulto tem 0,3 mg)
        "certo": [r"adrenalina|epinefrina", r"0[.,]3\s*(?:a|-|–|e)\s*0[.,]5\s*mg|0[.,][35]\s*mg",
                  r"\bIM\b|intramuscular"],
        "errado": [r"0[.,]1\s*(?:a|-|–)\s*0[.,]2\s*m[lL]", r"\b1\s*mg\s*(?:IM|intramuscular)",
                   r"0[.,]5\s*(?:a|-|–)\s*1\s*mg",
                   r"(?:adrenalina|epinefrina)[^.\n]{0,40}\b(?:IV|endovenos|intravenos)"],
    },
]

_SEM_BASE = re.compile(
    r"não (?:traz|trazem|encontr|cont[eé]m|h[aá] base|se apoia|est[aá] clar)|sem fonte|nenhuma fonte"
    r"|fontes consultadas não",
    re.IGNORECASE,
)


def julgar(texto: str, q: dict) -> str:
    certo = all(re.search(p, texto, re.IGNORECASE) for p in q["certo"])
    parcial = any(re.search(p, texto, re.IGNORECASE) for p in q["certo"])
    errado = any(re.search(p, texto, re.IGNORECASE) for p in q["errado"])
    sem_base = bool(_SEM_BASE.search(texto))
    if certo and not errado and not sem_base:
        return "certo"
    if certo or (errado and sem_base):
        return "revisar"
    if errado:
        return "errado"
    if sem_base:
        return "sem base"
    return "incompleto" if parcial else "errado"


async def rodar(com_fontes: bool, repeticoes: int) -> list:
    from backend.config import Config
    from backend.services import llm_provider, llm_services

    Config.COPILOT_LOCAL_SOURCES = com_fontes
    try:
        from backend.database import AsyncSessionLocal
    except Exception as e:  # sem DATABASE_URL: roda sem o catálogo
        print(f"Sem banco ({e}); o catálogo de medicamentos fica de fora.", file=sys.stderr)
        AsyncSessionLocal = None

    caps = llm_provider.capabilities()
    print(f"IA: {caps['provider']} {caps.get('model') or ''} · busca na web: {caps['web_search']} · "
          f"fontes antes da resposta: {'sim' if com_fontes else 'não'}\n")
    resultados = []
    for rep in range(1, repeticoes + 1):
        for q in PERGUNTAS:
            inicio = time.monotonic()
            if AsyncSessionLocal is None:
                saida = await llm_services.chat_with_google_ai(message=q["pergunta"], history=[], db=None)
            else:
                async with AsyncSessionLocal() as db:
                    saida = await llm_services.chat_with_google_ai(message=q["pergunta"], history=[], db=db)
            texto, _, _, refs, _ = saida
            veredito = julgar(texto or "", q)
            refs = refs or []
            resultados.append({
                "fontes": com_fontes, "repeticao": rep, "nome": q["nome"], "veredito": veredito,
                "segundos": round(time.monotonic() - inicio), "resposta": texto, "gabarito": q["gabarito"],
                "referencias": [{"tipo": r.get("source_type"), "titulo": r.get("title"), "pmid": r.get("pmid")}
                                for r in refs],
            })
            print(f"[{q['nome']}] {veredito} · {resultados[-1]['segundos']}s · {len(refs)} referência(s)")
            print("  resposta: " + " ".join((texto or "").split()))
            print(f"  esperado: {q['gabarito']}")
            for i, r in enumerate(refs, 1):
                print(f"  [{i}] {r.get('source_type')}: {(r.get('title') or '')[:100]}")
            print()
    return resultados


def resumo(resultados: list) -> str:
    contagem = {}
    for r in resultados:
        contagem[r["veredito"]] = contagem.get(r["veredito"], 0) + 1
    ordem = ("certo", "incompleto", "sem base", "revisar", "errado")
    return " · ".join(f"{v}: {contagem[v]}" for v in ordem if v in contagem) + f" (de {len(resultados)})"


def main():
    parser = argparse.ArgumentParser(description="Bateria de fatos clínicos do copiloto.")
    parser.add_argument("--sem-fontes", action="store_true", help="desliga a busca de fontes antes da resposta")
    parser.add_argument("--repeticoes", type=int, default=1)
    parser.add_argument("--json", help="grava as respostas e os vereditos neste arquivo")
    parser.add_argument("--rejulgar", help="refaz a correção das respostas gravadas neste arquivo, sem chamar a IA")
    parser.add_argument("-v", "--verbose", action="store_true", help="mostra o log do backend")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING)

    if args.rejulgar:
        with open(args.rejulgar, encoding="utf-8") as f:
            resultados = json.load(f)
        por_nome = {q["nome"]: q for q in PERGUNTAS}
        for r in resultados:
            r["veredito"] = julgar(r["resposta"] or "", por_nome[r["nome"]])
            print(f"[{r['nome']}] {r['veredito']}: " + " ".join((r["resposta"] or "").split())[:200])
    else:
        resultados = asyncio.run(rodar(not args.sem_fontes, max(1, args.repeticoes)))
    print("Resumo:", resumo(resultados))
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(resultados, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
