"""Controle de qualidade das questões geradas (pós-geração, antes de entregar).

O LLM erra de formas ESTRUTURAIS e detectáveis — enunciado sem acentuação, item
de lacuna que veio sem lacuna nenhuma, referência a "termos destacados" num
formato que não tem destaque, gabarito fora da faixa das alternativas. Confiar
só no prompt não basta: uma instrução nova pode, sozinha, quebrar outra coisa
(caso real: a regra "o enunciado é exibido como texto plano" fez o modelo
escrever um bloco inteiro sem acento E sem as lacunas).

Aqui a saída é VALIDADA. Havendo violação, o chamador refaz aquela geração UMA
vez passando a lista exata dos defeitos — auto-reparo dirigido, em vez de torcer
para o prompt cobrir todos os casos. O diagnóstico é determinístico; só a
correção é probabilística.
"""

import logging
import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Lacuna: aceita as convenções que o modelo usa na prática (____, ....., ( ))
BLANK_RE = re.compile(r'_{2,}|\.{4,}|\(\s{2,}\)')
# Enunciado que PROMETE lacuna
PROMISES_BLANK_RE = re.compile(
    r'\blacunas?\b|\bpreenchid[ao]s?\b|\bpreencher\b|\bcompletam\b|\bcompleta\s+corretamente\b',
    re.I,
)
# Menção a destaque — legítima SE o enunciado marcar o termo com **negrito**
PHANTOM_RE = re.compile(
    r'(termos?|palavras?|trechos?|express\w+|voc[áa]bulos?|elementos?)\s+(acima\s+)?(em\s+)?'
    r'(destacad\w+|grifad\w+|negrito|sublinhad\w+|em\s+destaque)'
    r'|\bno\s+trecho\s+destacad\w+|\bem\s+destaque\b',
    re.I,
)
BOLD_RE = re.compile(r'\*\*[^*\n]{1,120}\*\*')
# "de acordo com o texto", "no texto acima", "segundo o texto" — só vale com texto de apoio
MENTIONS_TEXT_RE = re.compile(
    r'\b(de acordo com o texto|segundo o texto|com base no texto|no texto (acima|a seguir|lido)'
    r'|do texto (acima|a seguir|lido)|conforme o texto|no fragmento acima|no trecho acima'
    r'|texto\s+[IVX]{1,4}\b)',
    re.I,
)
# Recursos que a interface NÃO tem em hipótese alguma
IMPOSSIBLE_REF_RE = re.compile(
    r'conforme\s+a\s+(figura|tabela|imagem)|\bna\s+linha\s+\d+|\bno\s+quadro\s+acima\b'
    r'|\bveja\s+a\s+(figura|tabela|imagem)\b|\bgrifad\w+|sublinhad\w+',
    re.I,
)
# Sinal forte de texto PT sem acentuação (não existe palavra em português
# terminada em "cao"/"coes" sem til; idem para os pares abaixo)
NO_ACCENT_RE = re.compile(
    r'\b\w{3,}(?:cao|coes)\b'
    r'|\b(?:nao|entao|tambem|alem|apos|voce|saude|medic[oa]|clinic[oa]|publico|'
    r'codigo|numero|criterio|proprio|possivel|necessario|referencia|urgencia|'
    r'emergencia|regencia|ocorrencias?|familia|antibiotico|diagnostico)\b',
    re.I,
)

ISSUE_LABELS = {
    'SEM_ACENTO': "enunciado/alternativas sem acentuação (ex.: 'internacao' em vez de 'internação')",
    'LACUNA_AUSENTE': "o enunciado fala em lacunas mas não há nenhuma lacuna marcada com ______",
    'LACUNA_DESCASADA': "o número de lacunas não bate com o número de termos das alternativas",
    'DESTAQUE_FANTASMA': "o comando fala em 'termos destacados' mas nada foi marcado com **negrito** no enunciado",
    'REFERENCIA_IMPOSSIVEL': "cita grifo, sublinhado, figura, tabela ou número de linha — recursos que a interface não tem",
    'GABARITO_INVALIDO': "resposta_correta não corresponde a nenhuma alternativa",
    'ALTERNATIVAS': "quantidade de alternativas fora do esperado",
    'ALTERNATIVAS_IGUAIS': "há alternativas repetidas",
    'CAMPO_VAZIO': "pergunta ou justificativa vazia",
    'TEXTO_BASE_AUSENTE': "a questão aponta para um texto de apoio que não foi declarado em textos_base",
    'TEXTO_INEXISTENTE': "o enunciado manda ler 'o texto', mas a questão não tem texto de apoio",
    'REPETE_PROVA_ANTERIOR': "a questão é praticamente a mesma de uma prova anterior deste card",
    'REPETE_NA_PROVA': "duas questões desta mesma prova cobram a mesma coisa",
}


SIMILARITY_LIMIT = 0.80  # acima disto é "a mesma questão reescrita"; 0,70 ainda é outro ângulo


def _norm_stem(text: str) -> str:
    t = unicodedata.normalize('NFKD', str(text or '')).encode('ascii', 'ignore').decode()
    t = re.sub(r'[^a-z0-9\s]', ' ', t.lower())
    return re.sub(r'\s+', ' ', t).strip()


def _sig_tokens(text: str) -> set:
    return {w for w in _norm_stem(text).split() if len(w) > 3}


# A avoid-list manda "<enunciado>  [cobrou: <gabarito> · <tópico>]". O sufixo serve ao
# MODELO (mostra o núcleo já cobrado), mas atrapalha a comparação: contra um enunciado
# idêntico ele derruba a similaridade de 1,00 para 0,71 — abaixo do limite — e a repetição
# passaria batida. Comparar só a parte do enunciado.
_ANOTACAO_RE = re.compile(r'\s*\[cobrou:.*?\]\s*$', re.S)


def _sem_anotacao(linha: str) -> str:
    return _ANOTACAO_RE.sub('', str(linha or '')).strip()


def _too_similar(stem: str, others: List[str], limit: float = SIMILARITY_LIMIT) -> Optional[str]:
    """Enunciado mais parecido que o limite, se houver. Pré-filtro por tokens antes do
    SequenceMatcher: a avoid-list de um bloco chega a 200 linhas e a comparação bruta
    (O(n·m) sobre strings longas) sairia caro dentro da geração."""
    a = _norm_stem(stem)
    if len(a) < 40:
        return None
    ta = _sig_tokens(stem)
    if not ta:
        return None
    for other in others:
        alvo = _sem_anotacao(other)
        tb = _sig_tokens(alvo)
        if not tb:
            continue
        if len(ta & tb) / len(ta | tb) < 0.35:
            continue
        if SequenceMatcher(None, a, _norm_stem(alvo)).ratio() >= limit:
            return alvo
    return None


def _accent_ratio(text: str) -> Tuple[float, int]:
    letters = 0
    accented = 0
    for ch in text:
        if ch.isalpha():
            letters += 1
            decomposed = unicodedata.normalize('NFD', ch)
            if len(decomposed) > 1 or ch in 'çÇ':
                accented += 1
    return ((100.0 * accented / letters) if letters else 0.0), letters


def _alt_items(alt: str) -> List[str]:
    """Alternativa composta ('a / hora a hora / à') → termos."""
    parts = [p.strip() for p in re.split(r'\s+/\s+|\s+-\s+', alt) if p.strip()]
    return parts


def check_question(q: Dict[str, Any], expected_alternatives: int = 4,
                   language: str = 'pt', support_labels: Any = None) -> List[str]:
    """Devolve os códigos de defeito encontrados numa questão."""
    if not isinstance(q, dict):
        return ['CAMPO_VAZIO']

    issues: List[str] = []
    stem = (q.get('pergunta') or q.get('enunciado') or '').strip()
    alts = [a for a in (q.get('alternativas') or []) if isinstance(a, str)]
    justif = (q.get('justificativa') or '').strip()
    blob = ' '.join([stem] + alts + [justif])

    if not stem:
        issues.append('CAMPO_VAZIO')

    if language.startswith('pt') and stem:
        ratio, letters = _accent_ratio(blob)
        if NO_ACCENT_RE.search(blob) or (letters >= 200 and ratio < 1.0):
            issues.append('SEM_ACENTO')

    # "os termos destacados" só é legítimo se houver **destaque** de verdade no enunciado
    if PHANTOM_RE.search(stem) and not BOLD_RE.search(stem):
        issues.append('DESTAQUE_FANTASMA')
    if IMPOSSIBLE_REF_RE.search(stem):
        issues.append('REFERENCIA_IMPOSSIVEL')

    labels = {str(x).strip().lower() for x in (support_labels or set())}
    ref = str(q.get('texto_base') or '').strip().lower()
    if ref and ref not in labels:
        issues.append('TEXTO_BASE_AUSENTE')
    elif not ref and MENTIONS_TEXT_RE.search(stem):
        issues.append('TEXTO_INEXISTENTE')

    n_blanks = len(BLANK_RE.findall(stem))
    if PROMISES_BLANK_RE.search(stem) and n_blanks == 0:
        issues.append('LACUNA_AUSENTE')
    elif n_blanks and alts:
        # alternativas compostas: cada uma deve ter 1 termo por lacuna
        counts = {len(_alt_items(a)) for a in alts}
        if len(counts) == 1 and counts != {n_blanks} and max(counts) > 1:
            issues.append('LACUNA_DESCASADA')

    if alts:
        if expected_alternatives and len(alts) != expected_alternatives:
            issues.append('ALTERNATIVAS')
        # ⚠️ normalizar só ESPAÇO EM EXCESSO. Remover espaços (ou acentos) faria
        # "por quê / porque" colapsar em "porquê / porque" — que é exatamente a
        # distinção cobrada nas questões de porquê/por que. Falso positivo real.
        norm = {' '.join(a.lower().split()).strip(' .;') for a in alts}
        if len(norm) != len(alts):
            issues.append('ALTERNATIVAS_IGUAIS')
        key = str(q.get('resposta_correta') or '').strip().lower()
        valid = {chr(ord('a') + i) for i in range(len(alts))}
        if key not in valid:
            issues.append('GABARITO_INVALIDO')

    return issues


def check_questions(questions: List[Any], expected_alternatives: int = 4,
                    language: str = 'pt', support_labels: Any = None,
                    prior_stems: Optional[List[str]] = None) -> List[Tuple[int, List[str]]]:
    """[(índice 1-based, [códigos])] apenas das questões com defeito.

    `support_labels`: rótulos dos textos de apoio declarados (minúsculos). Sem eles,
    qualquer referência a "o texto" é considerada órfã.
    `prior_stems`: avoid-list já enviada ao modelo. Questão com enunciado acima de
    SIMILARITY_LIMIT em relação a uma dessas entra como REPETE_PROVA_ANTERIOR — a
    instrução do prompt sozinha não segurava (medido: 5 pares quase idênticos entre
    provas do mesmo card). Repetição DENTRO da prova também é checada."""
    out = []
    lista = [q for q in (questions or [])]
    anteriores = [str(x) for x in (prior_stems or []) if str(x).strip()]
    for i, q in enumerate(lista, 1):
        found = check_question(q, expected_alternatives, language, support_labels)
        stem = (q.get('pergunta') or '') if isinstance(q, dict) else ''
        if stem:
            if anteriores and _too_similar(stem, anteriores):
                found.append('REPETE_PROVA_ANTERIOR')
            irmas = [(x.get('pergunta') or '') for j, x in enumerate(lista, 1)
                     if j < i and isinstance(x, dict)]
            if irmas and _too_similar(stem, irmas):
                found.append('REPETE_NA_PROVA')
        if found:
            out.append((i, found))
    return out


# Repetição é questão de GRAU, não defeito binário: quando o bloco tem fonte estreita
# (História local, Informática, Legislação — o concurso só cobra aqueles temas mesmo),
# repetir um ponto é inevitável e exigir novidade só queimaria uma chamada de LLM à toa.
REPETITION_CODES = {'REPETE_PROVA_ANTERIOR', 'REPETE_NA_PROVA'}
# ⚠️ Diretiva do fundador (ago/2026): **prevenir na primeira geração, não pagar para
# refazer.** Repetição é combatida no prompt (mapa de cobertura + proibição explícita de
# reaproveitar enunciado); o reparo fica como último recurso, e só quando o material sairia
# INUTILIZÁVEL. Por isso a tolerância é alta: abaixo dela, a repetição é registrada no log
# e entregue — gastar uma segunda geração de LLM para trocar 3 de 25 questões não se paga.
REPETITION_TOLERANCE = 0.40   # acima de 40% das questões repetindo, aí sim vale refazer
REPETITION_MIN_TO_REPAIR = 3  # e nunca por causa de uma ou duas questões


def should_repair(report: List[Tuple[int, List[str]]], total: int) -> bool:
    """Vale gastar a segunda chamada para consertar este bloco?

    Qualquer defeito ESTRUTURAL (sem acento, lacuna ausente, gabarito inválido…) sempre
    vale. Se o relatório só acusa REPETIÇÃO, vale apenas quando ela passa da tolerância:
    num bloco de 3 questões sobre um assunto pequeno, 1 repetida é o esperado."""
    if not report:
        return False
    duros = [i for i, codes in report if set(codes) - REPETITION_CODES]
    if duros:
        return True
    repetidas = len(report)
    if repetidas < REPETITION_MIN_TO_REPAIR:
        return False
    return total > 0 and (repetidas / total) > REPETITION_TOLERANCE


def summarize(report: List[Tuple[int, List[str]]]) -> str:
    """Resumo curto para log."""
    if not report:
        return 'ok'
    codes: Dict[str, int] = {}
    for _, found in report:
        for c in found:
            codes[c] = codes.get(c, 0) + 1
    return ', '.join(f'{c}×{n}' for c, n in sorted(codes.items()))


def build_repair_instruction(report: List[Tuple[int, List[str]]],
                             questions: List[Any]) -> str:
    """Instrução corretiva anexada ao prompt na SEGUNDA tentativa do bloco."""
    if not report:
        return ''
    codes = {c for _, found in report for c in found}
    linhas = [
        "🔁 CORREÇÃO OBRIGATÓRIA — a tentativa anterior deste bloco saiu com defeito. "
        "Gere as questões DE NOVO corrigindo o que está listado abaixo. Não repita nenhum "
        "dos defeitos; o resto das regras continua valendo."
    ]
    for c in sorted(codes):
        linhas.append(f"- {ISSUE_LABELS.get(c, c)}")
    if 'SEM_ACENTO' in codes:
        linhas.append(
            "  → Escreva TUDO em português com acentuação e cedilha completas: "
            "'internação', 'regência', 'ocorrências', 'médico de família', 'não'."
        )
    if 'LACUNA_AUSENTE' in codes or 'LACUNA_DESCASADA' in codes:
        linhas.append(
            "  → Item de preenchimento: a frase do enunciado precisa conter as lacunas "
            "marcadas com ______ (seis sublinhados), UMA para cada termo das alternativas, "
            "na mesma ordem. Nunca escreva a frase já preenchida."
        )
    if 'DESTAQUE_FANTASMA' in codes:
        linhas.append(
            "  → Marque os termos citados com **negrito** dentro do próprio enunciado, "
            "ou repita as palavras entre aspas simples no comando."
        )
    if 'TEXTO_BASE_AUSENTE' in codes or 'TEXTO_INEXISTENTE' in codes:
        linhas.append(
            "  → Se a questão depende de um texto de apoio, DECLARE o texto em `textos_base` "
            "(com `rotulo` e `conteudo`) e aponte a questão para ele pelo campo `texto_base` "
            "com o rótulo EXATO. Se não houver texto de apoio, não mencione 'o texto' no enunciado."
        )
    if 'REPETE_PROVA_ANTERIOR' in codes or 'REPETE_NA_PROVA' in codes:
        linhas.append(
            "  → TROQUE o ponto cobrado, não a redação: a lista de questões já cobradas "
            "traz o enunciado E o gabarito anterior. Escolha outro tópico/subtema do "
            "material-fonte, ainda não explorado, em vez de reescrever a mesma pergunta."
        )
    if 'REFERENCIA_IMPOSSIVEL' in codes:
        linhas.append(
            "  → Não existem figura, tabela, grifo, sublinhado nem numeração de linha: "
            "reescreva a questão sem depender desses recursos."
        )
    # amostra concreta do que saiu errado (ajuda mais que a regra abstrata)
    for idx, found in report[:3]:
        q = questions[idx - 1] if idx - 1 < len(questions) else {}
        stem = (q.get('pergunta') or '')[:180] if isinstance(q, dict) else ''
        if stem:
            linhas.append(f"  Exemplo do que saiu errado ({', '.join(found)}): \"{stem}…\"")
    return "\n".join(linhas)
