# tests/backend/test_latex_text.py
"""Tests for the inline LaTeX → Unicode normalization of copilot answers
(backend/services/latex_text.py), applied in llm_services.chat_with_google_ai.

Run directly (no pytest harness in this repo):
    python3 tests/backend/test_latex_text.py

The local model (Gemma 4) sometimes answers in LaTeX, and neither the web
(react-markdown) nor the mobile (react-native-markdown-display) renders math.
Covers the real answers from Oct/2026, the patterns the old fixed replacements
handled, and what must stay untouched: money amounts in $, code, unknown LaTeX
and the [n] citation markers that linkifyCitations (@qython/shared) links later.
"""
import os
import re
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, project_root)

from qython.backend.services.latex_text import latex_to_unicode as norm  # noqa: E402

# Mesmo padrão de linkifyCitations em packages/shared/src/references.js.
CITATION_RE = re.compile(r'\[(\d{1,2})\]')


def check(src, expected):
    got = norm(src)
    assert got == expected, f"\n  in:   {src!r}\n  got:  {got!r}\n  want: {expected!r}"


def unchanged(src):
    check(src, src)


def test_real_answers_oct_2026():
    check(r"manter a PAM $\geq 65 \text{ mm Hg}$ e lactato sérico $> 2 \text{ mmol/L}$",
          "manter a PAM ≥ 65 mm Hg e lactato sérico > 2 mmol/L")
    check(r"$90 \text{ mg/kg/dia} \times 20 \text{ kg} = 1800 \text{ mg/dia}$",
          "90 mg/kg/dia × 20 kg = 1800 mg/dia")
    check(r"qSOFA ($\text{RR} \geq 22/\text{min}$ …)",
          "qSOFA (RR ≥ 22/min …)")


def test_patterns_the_old_replacements_covered():
    check(r"HbA1c $\ge$ 6,5%", "HbA1c ≥ 6,5%")
    check(r"glicemia $\geq 7$ mmol/L", "glicemia ≥ 7 mmol/L")
    check(r"creatinina $\le 1,2$", "creatinina ≤ 1,2")
    check(r"$\leq 5$ dias", "≤ 5 dias")
    check(r"10 $\pm$ 2", "10 ± 2")
    check(r"50 $\mu$g", "50 μg")
    check(r"$\alpha$-bloqueador e $\beta$-bloqueador", "α-bloqueador e β-bloqueador")
    check(r"febre $\geq$38 °C, PAS $\geq$90", "febre ≥38 °C, PAS ≥90")
    check(r"$\geq$7", "≥7")


def test_arrows_and_operators():
    check(r"suspeita $\rightarrow$ lactato $\rightarrow$ cultura", "suspeita → lactato → cultura")
    check(r"$\uparrow$ PA e $\downarrow$ FC", "↑ PA e ↓ FC")
    check(r"$\text{CO}_2 + \text{H}_2\text{O} \rightleftharpoons \text{H}_2\text{CO}_3$",
          "CO₂ + H₂O ⇌ H₂CO₃")
    check(r"$2 \cdot 3 \neq 5 \approx 6$", "2 · 3 ≠ 5 ≈ 6")
    check(r"$\Delta$T", "ΔT")


def test_sub_and_superscripts():
    check(r"$\text{SpO}_2 \geq 94\%$", "SpO₂ ≥ 94%")
    check(r"$\text{PaO}_2/\text{FiO}_2 < 300$", "PaO₂/FiO₂ < 300")
    check(r"$\text{HCO}_3^-$ e $\text{Na}^+$", "HCO₃⁻ e Na⁺")
    check(r"$37^\circ\text{C}$ ou $38{,}5^{\circ}\text{C}$", "37°C ou 38,5°C")
    check(r"$1{,}73 \text{ m}^2$", "1,73 m²")
    check(r"plaquetas $< 100 \times 10^{9}/\text{L}$", "plaquetas < 100 × 10⁹/L")
    check(r"$C_{\text{max}}$ e $T_{max}$", "Cmax e Tmax")
    check(r"$e^{-kt}$", "e^(-kt)")
    # Colado na letra, como o LaTeX de química e unidade costuma vir.
    check(r"SpO$_2$, CO$_2$, HCO$_3^-$, m$^2$ e PAM$\geq 65$", "SpO₂, CO₂, HCO₃⁻, m² e PAM≥ 65")


def test_fractions_and_roots():
    check(r"$\frac{1}{2}$ e $\frac12$", "1/2 e 1/2")
    check(r"$\frac{\text{mL/min}}{1{,}73 \text{ m}^2}$", "mL/min/1,73 m²")
    check(r"$\frac{(140 - \text{idade}) \times \text{peso}}{72 \times \text{Cr}}$",
          "(140 - idade) × peso/(72 × Cr)")
    check(r"$\dfrac{a + b}{c}$", "(a + b)/c")
    check(r"$\sqrt{\text{SC}}$ e $\sqrt{a + b}$", "√SC e √(a + b)")
    check(r"$\left( \frac{1}{2} \right)^2$", "(1/2)²")


def test_other_delimiters():
    check("Dose:\n$$\n\\text{Dose} = 90 \\times 20\n$$\nfim", "Dose:\nDose = 90 × 20\nfim")
    check(r"$$\text{IMC} = \frac{\text{peso}}{\text{altura}^2}$$", "IMC = peso/altura²")
    check(r"relação \(\text{PaO}_2/\text{FiO}_2 < 300\)", "relação PaO₂/FiO₂ < 300")
    check(r"\[ \text{ClCr} = \frac{140 - \text{idade}}{72} \]", "ClCr = (140 - idade)/72")


def test_bare_commands_outside_delimiters():
    check(r"suspeita \rightarrow lactato", "suspeita → lactato")
    check(r"PAM \geq 65 mmHg", "PAM ≥ 65 mmHg")
    check(r"PAM 65\text{ mm Hg}", "PAM 65 mm Hg")
    # Escape literal seguido de palavra: "\n" + "e", "\t" + "o".
    unchanged(r"linha\ne outra")
    unchanged(r"\to o paciente")
    unchanged(r"C:\pasta\arquivo")


def test_money_untouched():
    unchanged("A consulta custa R$ 50,00 e o exame R$120.")
    unchanged("Preço: US$10 por mês ou US$ 100 por ano.")
    unchanged("Entre $5 e $10 por dose.")
    unchanged("Faixa de $5-$10, ou $1,000 to $2,000.")
    unchanged("R$50/R$60 conforme a farmácia.")
    unchanged("US$5 > R$ 2 nesse câmbio.")
    unchanged("Custa $5 > R$ 2.")
    unchanged("Valor de $20.")
    unchanged(r"Isso custa \$5 e \$10.")
    check(r"Custa R$ 50 e a PAM alvo é $\geq 65$.", "Custa R$ 50 e a PAM alvo é ≥ 65.")
    check(r"Custa $5 e a PAM alvo é $\geq 65$.", "Custa $5 e a PAM alvo é ≥ 65.")


def test_code_untouched():
    unchanged(r"Use `$\geq$` no template.")
    unchanged("Exemplo:\n```latex\n$\\geq 65 \\text{ mm Hg}$\n```\n")
    unchanged("Exemplo:\n~~~\n\\rightarrow $x^2$\n~~~")
    unchanged("Sem fechamento:\n```\n$\\times$\n")
    check("`$x^2$` vira $x^2$", "`$x^2$` vira x²")


def test_unknown_latex_stays_whole():
    unchanged(r"$\sum_{i=1}^n x_i$")
    unchanged(r"$\overline{x} \geq 2$")
    unchanged(r"$\begin{cases} a \\ b \end{cases}$")
    unchanged(r"$\sqrt[3]{x}$")
    unchanged(r"$\frac{1}{$")
    unchanged(r"$x^{}$ e $\frac{}{}$")


def test_plain_dollar_spans_without_latex_stay():
    unchanged("$65$ mmHg")
    unchanged("variável $x$")


def test_citations_preserved():
    src = r"PAM $\geq 65 \text{ mm Hg}$ [1] e lactato $> 2 \text{ mmol/L}$ [2]. Ver \[3\] e [12]."
    check(src, r"PAM ≥ 65 mm Hg [1] e lactato > 2 mmol/L [2]. Ver \[3\] e [12].")
    for text in (src, r"Dose $90 \times 20$[1][2]", r"$\text{RR} \geq 22$ [10]"):
        assert CITATION_RE.findall(norm(text)) == CITATION_RE.findall(text), text


def test_markdown_safe_output():
    out = norm(r"$\sim 5$ mg ou $\sim 10$ mg, $a \ast b$")
    out += norm(r"$x^{\ast}$ e $y^*$")
    assert "~" not in out and "*" not in out, out
    check(r"| PAM | $\geq 65 \text{ mmHg}$ |", "| PAM | ≥ 65 mmHg |")
    check(r"**PAM $\geq 65$**", "**PAM ≥ 65**")


def test_idempotent_and_empty():
    for text in (r"PAM $\geq 65 \text{ mm Hg}$", r"$\text{SpO}_2$", "R$ 50", r"$\sum x$"):
        once = norm(text)
        assert norm(once) == once, text
    assert norm(None) is None
    assert norm("") == ""
    unchanged("Texto sem LaTeX, com [1] e 50%.")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for fn in tests:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"FAIL  {fn.__name__}: {e}")
        except Exception as e:  # noqa: BLE001
            print(f"ERROR {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{passed}/{len(tests)} passed")
    sys.exit(0 if passed == len(tests) else 1)
