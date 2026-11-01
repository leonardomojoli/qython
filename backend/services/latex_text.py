# qython/backend/services/latex_text.py
"""
LaTeX inline simples → texto Unicode, nas respostas que o web e o mobile mostram
como Markdown.

A IA local (Gemma 4) às vezes responde em LaTeX: "manter a PAM $\\geq 65 \\text{ mm Hg}$"
ou "$90 \\text{ mg/kg/dia} \\times 20 \\text{ kg} = 1800 \\text{ mg/dia}$". Nem o
react-markdown (web) nem o react-native-markdown-display (mobile) renderizam
matemática, e o usuário via o LaTeX cru. Normalizar aqui vale para as duas
plataformas de uma vez: "PAM ≥ 65 mm Hg", "90 mg/kg/dia × 20 kg = 1800 mg/dia".

O que converte:
  - Trechos delimitados: $...$, $$...$$, \\(...\\) e \\[...\\]. O trecho todo vira
    texto (\\text{x} → x, \\geq → ≥, \\times → ×, \\rightarrow → →, \\frac{a}{b} → a/b,
    m^2 → m², CO_2 → CO₂) e os delimitadores saem.
  - Comandos soltos, fora de delimitador, só os inequívocos (`_BARE_SYMBOLS`) e
    \\text{...}.

O que não mexe:
  - Código: bloco cercado (``` ou ~~~) e `inline`.
  - $ de valor monetário: "R$ 50", "US$10", "custa $5 e $10", "$5-$10",
    "US$5 > R$ 2". O $ de abertura não pode vir seguido de espaço, nem o de
    fechamento depois de espaço (regra do Pandoc). O trecho precisa ter cara de
    LaTeX (`_MATH_HINT`) e passar por `_looks_like_money`.
  - Trecho com comando desconhecido (\\sum, \\begin{...}, \\overline...): fica
    como veio, sem conversão pela metade.
  - Marcadores de citação [n] (linkados depois por `linkifyCitations`, em
    @qython/shared): nada aqui cria nem remove colchete fora de LaTeX, e \\[1\\]
    sem comando dentro não é tratado como fórmula.
"""
import re

# Comandos de símbolo. `~` e `*` não entram crus: no Markdown (GFM) viram tachado
# e ênfase, daí ∼ (U+223C) e ∗ (U+2217).
_SYMBOLS = {
    # relações
    'geq': '≥', 'ge': '≥', 'geqslant': '≥', 'leq': '≤', 'le': '≤', 'leqslant': '≤',
    'neq': '≠', 'ne': '≠', 'approx': '≈', 'sim': '∼', 'simeq': '≃', 'equiv': '≡',
    'gt': '>', 'lt': '<', 'll': '≪', 'gg': '≫', 'propto': '∝',
    # operações
    'times': '×', 'cdot': '·', 'div': '÷', 'pm': '±', 'mp': '∓', 'ast': '∗',
    'infty': '∞', 'partial': '∂',
    # setas
    'rightarrow': '→', 'to': '→', 'longrightarrow': '→', 'Rightarrow': '⇒',
    'Longrightarrow': '⇒', 'implies': '⇒', 'leftarrow': '←', 'gets': '←',
    'longleftarrow': '←', 'Leftarrow': '⇐', 'leftrightarrow': '↔', 'Leftrightarrow': '⇔',
    'iff': '⇔', 'uparrow': '↑', 'downarrow': '↓', 'rightleftharpoons': '⇌',
    # letras gregas
    'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε',
    'varepsilon': 'ε', 'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'kappa': 'κ',
    'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'pi': 'π', 'rho': 'ρ',
    'sigma': 'σ', 'tau': 'τ', 'phi': 'φ', 'varphi': 'φ', 'chi': 'χ', 'psi': 'ψ',
    'omega': 'ω', 'Gamma': 'Γ', 'Delta': 'Δ', 'Theta': 'Θ', 'Lambda': 'Λ',
    'Pi': 'Π', 'Sigma': 'Σ', 'Phi': 'Φ', 'Psi': 'Ψ', 'Omega': 'Ω',
    # diversos
    'degree': '°', 'textdegree': '°', 'circ': '°', 'prime': '′', 'ldots': '…',
    'dots': '…', 'cdots': '…', 'checkmark': '✓', 'therefore': '∴', 'quad': ' ',
    'qquad': ' ',
    # só tamanho/estilo: somem
    'displaystyle': '', 'textstyle': '', 'limits': '', 'nolimits': '',
}

# Fora de delimitador, só nomes que não se confundem com escape literal seguido de
# palavra: "\ne" é "\n" + "e" e "\to" é "\t" + "o" num texto em português.
_BARE_SYMBOLS = frozenset({
    'geq', 'leq', 'neq', 'geqslant', 'leqslant', 'approx', 'equiv', 'times', 'cdot',
    'div', 'pm', 'infty', 'rightarrow', 'longrightarrow', 'Rightarrow', 'Longrightarrow',
    'implies', 'leftarrow', 'Leftarrow', 'leftrightarrow', 'Leftrightarrow', 'uparrow',
    'downarrow', 'rightleftharpoons', 'alpha', 'beta', 'gamma', 'delta', 'Delta',
    'theta', 'lambda', 'mu', 'sigma', 'omega', 'degree', 'checkmark',
})

# O argumento vira texto. \text e afins leem o argumento em modo texto (`_` e `^`
# literais); \mathrm e afins, em modo matemático.
_TEXT_MODE_COMMANDS = frozenset({
    'text', 'textrm', 'textnormal', 'textup', 'textit', 'textbf', 'textsf', 'texttt',
    'emph', 'mbox',
})
_MATH_FONT_COMMANDS = frozenset({
    'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'mathnormal', 'operatorname',
    'boldsymbol', 'bm', 'si', 'unit', 'num',
})
_FRAC_COMMANDS = frozenset({'frac', 'dfrac', 'tfrac', 'cfrac'})
_DELIMITER_SIZES = frozenset({
    'left', 'right', 'middle', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl',
    'Bigr', 'biggl', 'biggr', 'Biggl', 'Biggr',
})
_DELIMITER_COMMANDS = {'{': '{', '}': '}', '|': '|', 'langle': '⟨', 'rangle': '⟩',
                       'lvert': '|', 'rvert': '|', 'vert': '|'}

# Escapes de um caractere não-letra.
_ESCAPES = {'%': '%', '$': '$', '&': '&', '#': '#', '_': '_', '{': '{', '}': '}',
            ',': ' ', ';': ' ', ':': ' ', '>': ' ', ' ': ' ', '!': '', '\\': ' '}

_SUPERSCRIPT = dict(zip('0123456789+-−=()', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾'))
_SUPERSCRIPT.update({'°': '°', '′': '′', '∗': '∗', '*': '∗'})
_SUBSCRIPT = dict(zip('0123456789+-−=()', '₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎'))

# Trecho entre $ só conta como fórmula com algum sinal de LaTeX ou de comparação:
# "$65$" fica como está.
_MATH_HINT = re.compile(r'[\\^_{}<>=]')
# \(...\) e \[...\] precisam de comando, ^ ou _: "\[1\]" é colchete escapado.
_COMMAND_HINT = re.compile(r'\\[A-Za-z]|[\^_]')

_TOKEN_RE = re.compile(
    r'(?P<fence>```[\s\S]*?(?:```|\Z)|~~~[\s\S]*?(?:~~~|\Z))'
    r'|(?P<code>(?<!`)(`+)(?!`)[^\n]*?(?<!`)\3(?!`))'
    r'|(?<![\\$])\$\$(?P<display>[^$]+?)\$\$'
    r'|\\\[(?P<bracket>[\s\S]+?)\\\]'
    r'|\\\((?P<paren>[^\n]+?)\\\)'
    # $ de abertura: não escapado, seguido de não-espaço. $ de fechamento: depois de
    # não-espaço. O resto da proteção do valor monetário fica em _looks_like_money.
    r'|(?<![\\$])\$(?![\s$])(?P<inline>(?:\\.|[^$\n\\])+?)(?<=[^\s\\])\$(?!\$)'
    r'|\\(?P<bare_text>' + '|'.join(sorted(_TEXT_MODE_COMMANDS | _MATH_FONT_COMMANDS)) + r')\{[^{}\n]*\}'
    r'|\\(?P<bare>[A-Za-z]+)(?![A-Za-z])'
)


class _Unsupported(Exception):
    """Trecho com LaTeX que esta conversão não cobre: fica como veio."""


def latex_to_unicode(text: str) -> str:
    """Troca o LaTeX inline simples de `text` por texto Unicode. Código, $ de valor
    monetário e LaTeX que não dá para converter inteiro ficam como estão."""
    if not text or ('$' not in text and '\\' not in text):
        return text
    return _TOKEN_RE.sub(_replace, text)


def _replace(m: re.Match) -> str:
    original = m.group(0)
    if m.group('fence') is not None or m.group('code') is not None:
        return original
    if m.group('bare') is not None:
        name = m.group('bare')
        return _SYMBOLS[name] if name in _BARE_SYMBOLS else original
    if m.group('bare_text') is not None:
        # Sem colapsar espaço: o "65\text{ mm Hg}" solto precisa do espaço de dentro.
        try:
            return _parse(original, 0, closing=None, text_mode=False)[0]
        except _Unsupported:
            return original
    if m.group('display') is not None:
        content, hint = m.group('display'), _MATH_HINT
    elif m.group('inline') is not None:
        content, hint = m.group('inline'), _MATH_HINT
        if _looks_like_money(m, content):
            return original
    else:
        content, hint = m.group('bracket') or m.group('paren'), _COMMAND_HINT
    if not hint.search(content):
        return original
    try:
        return _convert_math(content)
    except _Unsupported:
        return original


def _looks_like_money(m: re.Match, content: str) -> bool:
    """$...$ que pode ser valor monetário: "US$5 > R$ 2", "$5-$10", "R$50/R$60".
    Colado em letra (R$, US$), só é fórmula se começar com \\, ^, _ ou {:
    "PAM$\\geq$", "SpO$_2$", "m$^2$". Sem comando dentro, não pode ter dígito
    logo depois do fechamento nem terminar em sigla de moeda ("... R$")."""
    before = m.string[m.start() - 1:m.start()]
    if before.isalpha() and not re.match(r'[\\^_{]', content):
        return True
    if re.search(r'\\[A-Za-z]', content):
        return False
    after = m.string[m.end():m.end() + 1]
    return after.isdigit() or bool(re.search(r'(?<![^\W\d_])[A-Z]{1,3}$', content))


def _convert_math(src: str) -> str:
    out, _ = _parse(src, 0, closing=None, text_mode=False)
    out = re.sub(r'\s+', ' ', out)
    # "\left( \frac{1}{2} \right)" → "(1/2)", não "( 1/2 )".
    out = re.sub(r'([(\[])\s+', r'\1', out)
    out = re.sub(r'\s+([)\]])', r'\1', out)
    return out.strip()


def _parse(src: str, i: int, closing, text_mode: bool):
    """Converte `src` a partir de `i` até `closing` ('}') ou o fim. Devolve
    (texto, posição depois do fechamento)."""
    parts = []
    while i < len(src):
        c = src[i]
        if c == '}':
            if closing == '}':
                return ''.join(parts), i + 1
            raise _Unsupported
        if c == '{':
            group, i = _parse(src, i + 1, '}', text_mode)
            parts.append(group)
        elif c == '\\':
            piece, i = _command(src, i, text_mode)
            parts.append(piece)
        elif c in '^_' and not text_mode:
            atom, i = _atom(src, i + 1)
            parts.append(_script(atom, c))
        elif c == '~':
            parts.append(' ')
            i += 1
        elif c in '$&':
            raise _Unsupported  # fórmula dentro de \text{}, alinhamento de tabela
        else:
            parts.append(c)
            i += 1
    if closing:
        raise _Unsupported  # chave sem fechamento
    return ''.join(parts), i


def _atom(src: str, i: int):
    """Um argumento: {grupo}, \\comando ou um caractere. Devolve (texto, posição)."""
    while i < len(src) and src[i] == ' ':
        i += 1
    if i >= len(src):
        raise _Unsupported
    if src[i] == '{':
        return _parse(src, i + 1, '}', text_mode=False)
    if src[i] == '\\':
        return _command(src, i, text_mode=False)
    if src[i] in '}^_':
        raise _Unsupported
    return src[i], i + 1


def _text_arg(src: str, i: int):
    while i < len(src) and src[i] == ' ':
        i += 1
    if i < len(src) and src[i] == '{':
        return _parse(src, i + 1, '}', text_mode=True)
    return _atom(src, i)


def _command(src: str, i: int, text_mode: bool):
    """`src[i]` é a barra. Devolve (texto, posição depois do comando e argumentos)."""
    j = i + 1
    if j >= len(src):
        raise _Unsupported
    if not src[j].isascii() or not src[j].isalpha():
        if src[j] in _ESCAPES:
            return _ESCAPES[src[j]], j + 1
        raise _Unsupported
    while j < len(src) and src[j].isascii() and src[j].isalpha():
        j += 1
    name = src[i + 1:j]

    if name in _SYMBOLS:
        return _SYMBOLS[name], j
    if name in _TEXT_MODE_COMMANDS:
        return _text_arg(src, j)
    if name in _MATH_FONT_COMMANDS:
        return _atom(src, j)
    if name in _FRAC_COMMANDS:
        num, j = _atom(src, j)
        den, j = _atom(src, j)
        if not num.strip() or not den.strip():
            raise _Unsupported
        return _fraction(num.strip(), den.strip()), j
    if name == 'sqrt':
        if src[j:j + 1] == '[':
            raise _Unsupported  # raiz de outro índice
        arg, j = _atom(src, j)
        arg = arg.strip()
        return ('√' + arg if re.fullmatch(r'\w+', arg) else f'√({arg})'), j
    if name in ('SI', 'qty'):
        value, j = _atom(src, j)
        unit, j = _atom(src, j)
        return f'{value.strip()} {unit.strip()}', j
    if name in _DELIMITER_SIZES:
        return _delimiter(src, j)
    raise _Unsupported


def _delimiter(src: str, j: int):
    """Delimitador depois de \\left, \\right, \\big...: "(" fica "(", "." some."""
    while j < len(src) and src[j] == ' ':
        j += 1
    if j >= len(src):
        raise _Unsupported
    if src[j] == '.':
        return '', j + 1
    if src[j] == '\\':
        k = j + 1
        while k < len(src) and src[k].isascii() and src[k].isalpha():
            k += 1
        name = src[j + 1:k] or src[j + 1:j + 2]
        if name not in _DELIMITER_COMMANDS:
            raise _Unsupported
        return _DELIMITER_COMMANDS[name], max(k, j + 2)
    if src[j] in '()[]|/<>':
        return src[j], j + 1
    raise _Unsupported


def _fraction(num: str, den: str) -> str:
    """a/b, com parênteses só onde a leitura mudaria: soma no numerador; soma ou
    produto no denominador. "mL/min/1,73 m²" e "(140 − idade) × peso/(72 × Cr)"."""
    if _top_level_has(num, '+±∓') or _top_level_minus(num):
        num = f'({num})'
    if _top_level_has(den, '+±∓×·÷/') or _top_level_minus(den):
        den = f'({den})'
    return f'{num}/{den}'


def _strip_parens(s: str) -> str:
    prev = None
    while prev != s:
        prev, s = s, re.sub(r'\([^()]*\)', '', s)
    return s


def _top_level_has(s: str, chars: str) -> bool:
    return any(ch in chars for ch in _strip_parens(s))


def _top_level_minus(s: str) -> bool:
    # Menos binário ("140 - idade", "2-1"), não sinal ("-5") nem hífen ("dose-alvo").
    return bool(re.search(r'\S\s+[-−]\s+\S|[\d)][-−][\w(]', _strip_parens(s)))


def _script(atom: str, kind: str) -> str:
    """^ e _: Unicode quando todos os caracteres têm versão sobrescrita/subscrita
    (m^2 → m², CO_2 → CO₂, Na^+ → Na⁺, 37^\\circ → 37°). Senão, subscrito vira texto
    corrido (T_{max} → Tmax) e sobrescrito fica com ^ (e^{kt} → e^(kt))."""
    atom = atom.strip()
    if not atom:
        raise _Unsupported
    table = _SUPERSCRIPT if kind == '^' else _SUBSCRIPT
    if all(ch in table for ch in atom):
        return ''.join(table[ch] for ch in atom)
    if kind == '_':
        return atom
    return '^' + (atom if len(atom) == 1 else f'({atom})')
