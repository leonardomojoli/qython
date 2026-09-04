# backend/data/orientation_templates.py
"""
Patient orientation templates - multilingual medical education materials.
Used for generating printable patient handouts (PDF).
"""

ORIENTATION_TEMPLATES = {
    "glucose_control": {
        "title_pt": "Controle de Glicemia",
        "title_en": "Blood Glucose Control",
        "title_es": "Control de Glucemia",
        "specialty": "Endocrinologia",
        "icon": "tint",
        "content_pt": """
<h2>Tabela de Controle de Glicemia</h2>
<p>Preencha esta tabela diariamente com os valores de glicemia medidos. Leve este documento em todas as consultas.</p>

<table>
    <thead>
        <tr>
            <th>Data</th>
            <th>Jejum (mg/dL)</th>
            <th>Antes do Almoço</th>
            <th>Depois do Almoço</th>
            <th>Antes do Jantar</th>
            <th>Ao Deitar</th>
            <th>Insulina/Medicação</th>
            <th>Observações</th>
        </tr>
    </thead>
    <tbody>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody>
</table>

<h3>Valores de Referência</h3>
<ul>
    <li><strong>Jejum:</strong> 70 a 100 mg/dL (ideal &lt; 130 mg/dL para diabéticos)</li>
    <li><strong>2h após refeição:</strong> &lt; 140 mg/dL (ideal &lt; 180 mg/dL para diabéticos)</li>
    <li><strong>Ao deitar:</strong> 100 a 140 mg/dL</li>
    <li><strong>Hipoglicemia:</strong> &lt; 70 mg/dL - ingerir 15g de carboidrato rápido</li>
</ul>

<h3>Sinais de Alerta</h3>
<p>Procure atendimento médico imediato se:</p>
<ul>
    <li>Glicemia abaixo de 54 mg/dL (hipoglicemia grave)</li>
    <li>Glicemia acima de 300 mg/dL persistente</li>
    <li>Náuseas, vômitos, dor abdominal ou confusão mental</li>
    <li>Hálito com odor frutado (cetoacidose)</li>
</ul>
""",
        "content_en": """
<h2>Blood Glucose Monitoring Diary</h2>
<p>Fill in this table daily with your measured blood glucose values. Bring this document to all appointments.</p>

<table>
    <thead>
        <tr>
            <th>Date</th>
            <th>Fasting (mg/dL)</th>
            <th>Before Lunch</th>
            <th>After Lunch</th>
            <th>Before Dinner</th>
            <th>Bedtime</th>
            <th>Insulin/Medication</th>
            <th>Notes</th>
        </tr>
    </thead>
    <tbody>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody>
</table>

<h3>Reference Values</h3>
<ul>
    <li><strong>Fasting:</strong> 70 to 100 mg/dL (target &lt; 130 mg/dL for diabetics)</li>
    <li><strong>2h after meal:</strong> &lt; 140 mg/dL (target &lt; 180 mg/dL for diabetics)</li>
    <li><strong>Bedtime:</strong> 100 to 140 mg/dL</li>
    <li><strong>Hypoglycemia:</strong> &lt; 70 mg/dL - consume 15g of fast-acting carbohydrate</li>
</ul>

<h3>Warning Signs</h3>
<p>Seek immediate medical attention if:</p>
<ul>
    <li>Blood glucose below 54 mg/dL (severe hypoglycemia)</li>
    <li>Blood glucose above 300 mg/dL persistently</li>
    <li>Nausea, vomiting, abdominal pain, or confusion</li>
    <li>Fruity breath odor (diabetic ketoacidosis)</li>
</ul>
""",
        "content_es": """
<h2>Tabla de Control de Glucemia</h2>
<p>Complete esta tabla diariamente con los valores de glucemia medidos. Lleve este documento a todas las consultas.</p>

<table>
    <thead>
        <tr>
            <th>Fecha</th>
            <th>Ayuno (mg/dL)</th>
            <th>Antes del Almuerzo</th>
            <th>Después del Almuerzo</th>
            <th>Antes de la Cena</th>
            <th>Al Acostarse</th>
            <th>Insulina/Medicación</th>
            <th>Observaciones</th>
        </tr>
    </thead>
    <tbody>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody>
</table>

<h3>Valores de Referencia</h3>
<ul>
    <li><strong>Ayuno:</strong> 70 a 100 mg/dL (objetivo &lt; 130 mg/dL para diabéticos)</li>
    <li><strong>2h después de comida:</strong> &lt; 140 mg/dL (objetivo &lt; 180 mg/dL para diabéticos)</li>
    <li><strong>Al acostarse:</strong> 100 a 140 mg/dL</li>
    <li><strong>Hipoglucemia:</strong> &lt; 70 mg/dL - ingerir 15g de carbohidrato rápido</li>
</ul>

<h3>Señales de Alerta</h3>
<p>Busque atención médica inmediata si:</p>
<ul>
    <li>Glucemia por debajo de 54 mg/dL (hipoglucemia grave)</li>
    <li>Glucemia por encima de 300 mg/dL de forma persistente</li>
    <li>Náuseas, vómitos, dolor abdominal o confusión mental</li>
    <li>Aliento con olor afrutado (cetoacidosis)</li>
</ul>
"""
    },

    "blood_pressure": {
        "title_pt": "Controle de Pressão Arterial",
        "title_en": "Blood Pressure Monitoring",
        "title_es": "Control de Presión Arterial",
        "specialty": "Cardiologia",
        "icon": "heartbeat",
        "content_pt": """
<h2>Diário de Pressão Arterial</h2>
<p>Meça sua pressão arterial duas vezes ao dia (manhã e noite), sempre no mesmo horário. Anote os valores abaixo.</p>

<h3>Como Medir Corretamente</h3>
<ul>
    <li>Sente-se confortavelmente por 5 minutos antes de medir</li>
    <li>Não fume, beba café ou faça exercício nos 30 minutos anteriores</li>
    <li>Apoie o braço na altura do coração</li>
    <li>Não fale durante a medição</li>
    <li>Faça duas medições com 1-2 minutos de intervalo e anote a média</li>
</ul>

<table>
    <thead>
        <tr>
            <th>Data</th>
            <th>Manhã (PAS/PAD)</th>
            <th>FC (bpm)</th>
            <th>Noite (PAS/PAD)</th>
            <th>FC (bpm)</th>
            <th>Medicação Tomada</th>
            <th>Observações</th>
        </tr>
    </thead>
    <tbody>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
    </tbody>
</table>

<h3>Classificação da Pressão Arterial</h3>
<table>
    <thead>
        <tr><th>Categoria</th><th>Sistólica (PAS)</th><th>Diastólica (PAD)</th></tr>
    </thead>
    <tbody>
        <tr><td>Normal</td><td>&lt; 120 mmHg</td><td>&lt; 80 mmHg</td></tr>
        <tr><td>Pré-hipertensão</td><td>120-139 mmHg</td><td>80-89 mmHg</td></tr>
        <tr><td>Hipertensão Estágio 1</td><td>140-159 mmHg</td><td>90-99 mmHg</td></tr>
        <tr><td>Hipertensão Estágio 2</td><td>&ge; 160 mmHg</td><td>&ge; 100 mmHg</td></tr>
    </tbody>
</table>

<p><strong>Atenção:</strong> Procure atendimento médico se a pressão estiver acima de 180/120 mmHg ou se houver sintomas como dor de cabeça intensa, dor no peito, falta de ar ou alterações visuais.</p>
""",
        "content_en": """
<h2>Blood Pressure Diary</h2>
<p>Measure your blood pressure twice daily (morning and evening), always at the same time. Record the values below.</p>

<h3>How to Measure Correctly</h3>
<ul>
    <li>Sit comfortably for 5 minutes before measuring</li>
    <li>Do not smoke, drink coffee, or exercise within 30 minutes before</li>
    <li>Support your arm at heart level</li>
    <li>Do not talk during the measurement</li>
    <li>Take two measurements 1-2 minutes apart and record the average</li>
</ul>

<table>
    <thead>
        <tr>
            <th>Date</th>
            <th>Morning (SBP/DBP)</th>
            <th>HR (bpm)</th>
            <th>Evening (SBP/DBP)</th>
            <th>HR (bpm)</th>
            <th>Medication Taken</th>
            <th>Notes</th>
        </tr>
    </thead>
    <tbody>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
    </tbody>
</table>

<h3>Blood Pressure Classification</h3>
<table>
    <thead>
        <tr><th>Category</th><th>Systolic (SBP)</th><th>Diastolic (DBP)</th></tr>
    </thead>
    <tbody>
        <tr><td>Normal</td><td>&lt; 120 mmHg</td><td>&lt; 80 mmHg</td></tr>
        <tr><td>Elevated</td><td>120-129 mmHg</td><td>&lt; 80 mmHg</td></tr>
        <tr><td>Hypertension Stage 1</td><td>130-139 mmHg</td><td>80-89 mmHg</td></tr>
        <tr><td>Hypertension Stage 2</td><td>&ge; 140 mmHg</td><td>&ge; 90 mmHg</td></tr>
    </tbody>
</table>

<p><strong>Warning:</strong> Seek immediate medical attention if blood pressure is above 180/120 mmHg or if you experience severe headache, chest pain, shortness of breath, or visual changes.</p>
""",
        "content_es": """
<h2>Diario de Presión Arterial</h2>
<p>Mida su presión arterial dos veces al día (mañana y noche), siempre a la misma hora. Anote los valores a continuación.</p>

<h3>Cómo Medir Correctamente</h3>
<ul>
    <li>Siéntese cómodamente durante 5 minutos antes de medir</li>
    <li>No fume, beba café ni haga ejercicio en los 30 minutos anteriores</li>
    <li>Apoye el brazo a la altura del corazón</li>
    <li>No hable durante la medición</li>
    <li>Realice dos mediciones con 1-2 minutos de intervalo y anote el promedio</li>
</ul>

<table>
    <thead>
        <tr>
            <th>Fecha</th>
            <th>Mañana (PAS/PAD)</th>
            <th>FC (lpm)</th>
            <th>Noche (PAS/PAD)</th>
            <th>FC (lpm)</th>
            <th>Medicación Tomada</th>
            <th>Observaciones</th>
        </tr>
    </thead>
    <tbody>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
        <tr><td>___/___</td><td>___/___</td><td></td><td>___/___</td><td></td><td></td><td></td></tr>
    </tbody>
</table>

<h3>Clasificación de la Presión Arterial</h3>
<table>
    <thead>
        <tr><th>Categoría</th><th>Sistólica (PAS)</th><th>Diastólica (PAD)</th></tr>
    </thead>
    <tbody>
        <tr><td>Normal</td><td>&lt; 120 mmHg</td><td>&lt; 80 mmHg</td></tr>
        <tr><td>Prehipertensión</td><td>120-139 mmHg</td><td>80-89 mmHg</td></tr>
        <tr><td>Hipertensión Etapa 1</td><td>140-159 mmHg</td><td>90-99 mmHg</td></tr>
        <tr><td>Hipertensión Etapa 2</td><td>&ge; 160 mmHg</td><td>&ge; 100 mmHg</td></tr>
    </tbody>
</table>

<p><strong>Atención:</strong> Busque atención médica si la presión está por encima de 180/120 mmHg o si presenta dolor de cabeza intenso, dolor en el pecho, falta de aire o alteraciones visuales.</p>
"""
    },

    "diet_low_sodium": {
        "title_pt": "Dieta com Restrição de Sódio",
        "title_en": "Low Sodium Diet Guidelines",
        "title_es": "Dieta con Restricción de Sodio",
        "specialty": "Cardiologia",
        "icon": "utensils",
        "content_pt": """
<h2>Orientações para Dieta com Restrição de Sódio</h2>
<p>A redução do consumo de sal é fundamental para o controle da pressão arterial e prevenção de retenção de líquidos. A meta diária é consumir no máximo <strong>2.000 mg de sódio (aproximadamente 5g de sal)</strong>.</p>

<h3>Alimentos a EVITAR</h3>
<ul>
    <li><strong>Embutidos:</strong> presunto, salame, mortadela, linguiça, bacon, salsicha</li>
    <li><strong>Enlatados:</strong> milho, ervilha, atum, sardinha em conserva (prefira versões sem sal)</li>
    <li><strong>Temperos prontos:</strong> caldos em cubo, sachês de tempero, shoyu, molho inglês</li>
    <li><strong>Queijos salgados:</strong> parmesão, provolone, queijo prato</li>
    <li><strong>Salgadinhos:</strong> chips, biscoitos salgados, amendoim salgado</li>
    <li><strong>Fast food:</strong> hambúrgueres, pizzas, comida congelada industrializada</li>
</ul>

<h3>Alimentos PERMITIDOS e Recomendados</h3>
<ul>
    <li><strong>Temperos naturais:</strong> alho, cebola, limão, salsa, cebolinha, orégano, manjericão, alecrim</li>
    <li><strong>Frutas e verduras:</strong> todas são permitidas e encorajadas</li>
    <li><strong>Proteínas frescas:</strong> frango, peixe, carne magra (preparados sem sal em excesso)</li>
    <li><strong>Grãos:</strong> arroz integral, feijão cozido em casa, lentilha</li>
    <li><strong>Laticínios:</strong> leite, iogurte natural, queijo cottage, ricota</li>
</ul>

<h3>Dicas Práticas</h3>
<ul>
    <li>Leia os rótulos dos alimentos - procure produtos com menos de 200mg de sódio por porção</li>
    <li>Cozinhe em casa sempre que possível</li>
    <li>Retire o saleiro da mesa</li>
    <li>Use ervas e especiarias no lugar do sal</li>
    <li>Enxágue alimentos enlatados antes de consumir</li>
</ul>
""",
        "content_en": """
<h2>Low Sodium Diet Guidelines</h2>
<p>Reducing salt intake is essential for blood pressure control and preventing fluid retention. The daily goal is to consume no more than <strong>2,000 mg of sodium (approximately 1 teaspoon of salt)</strong>.</p>

<h3>Foods to AVOID</h3>
<ul>
    <li><strong>Processed meats:</strong> ham, salami, bologna, sausage, bacon, hot dogs</li>
    <li><strong>Canned goods:</strong> canned corn, peas, tuna, sardines (prefer no-salt versions)</li>
    <li><strong>Seasonings:</strong> bouillon cubes, seasoning packets, soy sauce, Worcestershire sauce</li>
    <li><strong>Salty cheeses:</strong> parmesan, cheddar, processed cheese</li>
    <li><strong>Snacks:</strong> chips, crackers, salted nuts</li>
    <li><strong>Fast food:</strong> burgers, pizza, frozen meals</li>
</ul>

<h3>ALLOWED and Recommended Foods</h3>
<ul>
    <li><strong>Natural seasonings:</strong> garlic, onion, lemon, parsley, chives, oregano, basil, rosemary</li>
    <li><strong>Fruits and vegetables:</strong> all are allowed and encouraged</li>
    <li><strong>Fresh proteins:</strong> chicken, fish, lean meat (prepared without excess salt)</li>
    <li><strong>Grains:</strong> brown rice, home-cooked beans, lentils</li>
    <li><strong>Dairy:</strong> milk, plain yogurt, cottage cheese, ricotta</li>
</ul>

<h3>Practical Tips</h3>
<ul>
    <li>Read food labels - look for products with less than 200mg sodium per serving</li>
    <li>Cook at home whenever possible</li>
    <li>Remove the salt shaker from the table</li>
    <li>Use herbs and spices instead of salt</li>
    <li>Rinse canned foods before consuming</li>
</ul>
""",
        "content_es": """
<h2>Orientaciones para Dieta con Restricción de Sodio</h2>
<p>La reducción del consumo de sal es fundamental para el control de la presión arterial y la prevención de retención de líquidos. La meta diaria es consumir como máximo <strong>2.000 mg de sodio (aproximadamente 5g de sal)</strong>.</p>

<h3>Alimentos a EVITAR</h3>
<ul>
    <li><strong>Embutidos:</strong> jamón, salami, mortadela, chorizo, tocino, salchichas</li>
    <li><strong>Enlatados:</strong> maíz, guisantes, atún, sardinas en conserva (prefiera versiones sin sal)</li>
    <li><strong>Condimentos preparados:</strong> caldos en cubo, sobres de condimento, salsa de soja</li>
    <li><strong>Quesos salados:</strong> parmesano, provolone, queso manchego curado</li>
    <li><strong>Snacks:</strong> papas fritas, galletas saladas, maní salado</li>
    <li><strong>Comida rápida:</strong> hamburguesas, pizzas, comida congelada industrial</li>
</ul>

<h3>Alimentos PERMITIDOS y Recomendados</h3>
<ul>
    <li><strong>Condimentos naturales:</strong> ajo, cebolla, limón, perejil, cebollín, orégano, albahaca, romero</li>
    <li><strong>Frutas y verduras:</strong> todas están permitidas y recomendadas</li>
    <li><strong>Proteínas frescas:</strong> pollo, pescado, carne magra (preparados sin exceso de sal)</li>
    <li><strong>Granos:</strong> arroz integral, frijoles cocidos en casa, lentejas</li>
    <li><strong>Lácteos:</strong> leche, yogur natural, queso cottage, ricotta</li>
</ul>

<h3>Consejos Prácticos</h3>
<ul>
    <li>Lea las etiquetas de los alimentos - busque productos con menos de 200mg de sodio por porción</li>
    <li>Cocine en casa siempre que sea posible</li>
    <li>Retire el salero de la mesa</li>
    <li>Use hierbas y especias en lugar de sal</li>
    <li>Enjuague los alimentos enlatados antes de consumir</li>
</ul>
"""
    },

    "diet_diabetic": {
        "title_pt": "Orientações Alimentares para Diabetes",
        "title_en": "Diabetic Diet Guidelines",
        "title_es": "Orientaciones Alimentarias para Diabetes",
        "specialty": "Endocrinologia",
        "icon": "apple-alt",
        "content_pt": """
<h2>Orientações Alimentares para Diabetes</h2>
<p>Uma alimentação equilibrada é parte fundamental do tratamento do diabetes. O objetivo é manter os níveis de glicose no sangue dentro da faixa adequada.</p>

<h3>Princípios Gerais</h3>
<ul>
    <li>Faça 5 a 6 refeições por dia (3 principais + 2-3 lanches)</li>
    <li>Não pule refeições - intervalos longos podem causar hipoglicemia</li>
    <li>Mantenha horários regulares para as refeições</li>
    <li>Mastigue bem os alimentos e coma devagar</li>
    <li>Beba pelo menos 2 litros de água por dia</li>
</ul>

<h3>Alimentos com Baixo Índice Glicêmico (Preferir)</h3>
<ul>
    <li><strong>Cereais integrais:</strong> arroz integral, aveia, pão integral, macarrão integral</li>
    <li><strong>Leguminosas:</strong> feijão, lentilha, grão-de-bico, ervilha</li>
    <li><strong>Verduras e legumes:</strong> brócolis, couve-flor, abobrinha, berinjela, tomate</li>
    <li><strong>Frutas (com moderação):</strong> maçã, pera, morango, laranja (com bagaço)</li>
    <li><strong>Proteínas magras:</strong> frango, peixe, ovos, queijo branco</li>
</ul>

<h3>Alimentos a EVITAR ou Consumir com Moderação</h3>
<ul>
    <li><strong>Açúcares:</strong> açúcar refinado, mel, doces, refrigerantes, sucos industrializados</li>
    <li><strong>Carboidratos simples:</strong> pão branco, arroz branco em excesso, batata frita</li>
    <li><strong>Frutas muito doces em excesso:</strong> uva, manga, banana (limitara 1 porção/dia)</li>
    <li><strong>Bebidas alcoólicas:</strong> podem causar hipoglicemia, especialmente em jejum</li>
    <li><strong>Gorduras saturadas:</strong> frituras, carnes gordas, manteiga em excesso</li>
</ul>

<h3>Exemplo de Prato Saudável</h3>
<p>Divida seu prato em 4 partes:</p>
<ul>
    <li><strong>1/2 do prato:</strong> salada e vegetais</li>
    <li><strong>1/4 do prato:</strong> proteína (carne, frango, peixe ou ovos)</li>
    <li><strong>1/4 do prato:</strong> carboidrato (arroz integral, batata doce ou macarrão integral)</li>
</ul>
""",
        "content_en": """
<h2>Diabetic Diet Guidelines</h2>
<p>A balanced diet is a fundamental part of diabetes management. The goal is to keep blood glucose levels within the appropriate range.</p>

<h3>General Principles</h3>
<ul>
    <li>Eat 5 to 6 meals per day (3 main + 2-3 snacks)</li>
    <li>Do not skip meals - long intervals can cause hypoglycemia</li>
    <li>Maintain regular meal times</li>
    <li>Chew food well and eat slowly</li>
    <li>Drink at least 2 liters of water per day</li>
</ul>

<h3>Low Glycemic Index Foods (Prefer)</h3>
<ul>
    <li><strong>Whole grains:</strong> brown rice, oats, whole wheat bread, whole wheat pasta</li>
    <li><strong>Legumes:</strong> beans, lentils, chickpeas, peas</li>
    <li><strong>Vegetables:</strong> broccoli, cauliflower, zucchini, eggplant, tomato</li>
    <li><strong>Fruits (in moderation):</strong> apple, pear, strawberry, orange (with pulp)</li>
    <li><strong>Lean proteins:</strong> chicken, fish, eggs, cottage cheese</li>
</ul>

<h3>Foods to AVOID or Consume in Moderation</h3>
<ul>
    <li><strong>Sugars:</strong> refined sugar, honey, sweets, sodas, juice drinks</li>
    <li><strong>Simple carbs:</strong> white bread, excess white rice, french fries</li>
    <li><strong>Very sweet fruits in excess:</strong> grapes, mango, banana (limit to 1 serving/day)</li>
    <li><strong>Alcoholic beverages:</strong> can cause hypoglycemia, especially when fasting</li>
    <li><strong>Saturated fats:</strong> fried foods, fatty meats, excess butter</li>
</ul>

<h3>Healthy Plate Example</h3>
<p>Divide your plate into 4 parts:</p>
<ul>
    <li><strong>1/2 of plate:</strong> salad and vegetables</li>
    <li><strong>1/4 of plate:</strong> protein (meat, chicken, fish, or eggs)</li>
    <li><strong>1/4 of plate:</strong> carbohydrate (brown rice, sweet potato, or whole wheat pasta)</li>
</ul>
""",
        "content_es": """
<h2>Orientaciones Alimentarias para Diabetes</h2>
<p>Una alimentación equilibrada es parte fundamental del tratamiento de la diabetes. El objetivo es mantener los niveles de glucosa en sangre dentro del rango adecuado.</p>

<h3>Principios Generales</h3>
<ul>
    <li>Realice 5 a 6 comidas por día (3 principales + 2-3 meriendas)</li>
    <li>No se salte las comidas - intervalos largos pueden causar hipoglucemia</li>
    <li>Mantenga horarios regulares para las comidas</li>
    <li>Mastique bien los alimentos y coma despacio</li>
    <li>Beba al menos 2 litros de agua por día</li>
</ul>

<h3>Alimentos con Bajo Índice Glucémico (Preferir)</h3>
<ul>
    <li><strong>Cereales integrales:</strong> arroz integral, avena, pan integral, pasta integral</li>
    <li><strong>Legumbres:</strong> frijoles, lentejas, garbanzos, guisantes</li>
    <li><strong>Verduras y hortalizas:</strong> brócoli, coliflor, calabacín, berenjena, tomate</li>
    <li><strong>Frutas (con moderación):</strong> manzana, pera, fresa, naranja (con pulpa)</li>
    <li><strong>Proteínas magras:</strong> pollo, pescado, huevos, queso fresco</li>
</ul>

<h3>Alimentos a EVITAR o Consumir con Moderación</h3>
<ul>
    <li><strong>Azúcares:</strong> azúcar refinada, miel, dulces, refrescos, jugos industriales</li>
    <li><strong>Carbohidratos simples:</strong> pan blanco, exceso de arroz blanco, papas fritas</li>
    <li><strong>Frutas muy dulces en exceso:</strong> uva, mango, banana (limitar a 1 porción/día)</li>
    <li><strong>Bebidas alcohólicas:</strong> pueden causar hipoglucemia, especialmente en ayunas</li>
    <li><strong>Grasas saturadas:</strong> frituras, carnes grasas, exceso de mantequilla</li>
</ul>

<h3>Ejemplo de Plato Saludable</h3>
<p>Divida su plato en 4 partes:</p>
<ul>
    <li><strong>1/2 del plato:</strong> ensalada y vegetales</li>
    <li><strong>1/4 del plato:</strong> proteína (carne, pollo, pescado o huevos)</li>
    <li><strong>1/4 del plato:</strong> carbohidrato (arroz integral, batata o pasta integral)</li>
</ul>
"""
    },

    "pre_op": {
        "title_pt": "Orientações Pré-Operatórias",
        "title_en": "Pre-Operative Recommendations",
        "title_es": "Orientaciones Preoperatorias",
        "specialty": "Cirurgia Geral",
        "icon": "procedures",
        "content_pt": """
<h2>Orientações Pré-Operatórias</h2>
<p>Siga estas orientações cuidadosamente para garantir uma cirurgia segura. Em caso de dúvida, entre em contato com a equipe médica.</p>

<h3>Jejum</h3>
<ul>
    <li><strong>Alimentos sólidos:</strong> jejum absoluto de 8 horas antes da cirurgia</li>
    <li><strong>Líquidos claros:</strong> água, chá sem leite ou suco coado podem ser ingeridos até 2 horas antes (confirme com seu médico)</li>
    <li><strong>Leite e derivados:</strong> suspender 6 horas antes</li>
    <li><strong>Chicletes e balas:</strong> não consumir no dia da cirurgia</li>
</ul>

<h3>Medicamentos</h3>
<ul>
    <li><strong>Anti-hipertensivos:</strong> tomar normalmente com um gole de água (salvo orientação contrária)</li>
    <li><strong>Anticoagulantes (varfarina, rivaroxabana, etc.):</strong> suspender conforme orientação médica (geralmente 3-7 dias antes)</li>
    <li><strong>AAS (aspirina):</strong> suspender 7 dias antes (salvo orientação contrária)</li>
    <li><strong>Anti-inflamatórios (ibuprofeno, naproxeno):</strong> suspender 5 dias antes</li>
    <li><strong>Metformina:</strong> suspender 48 horas antes</li>
    <li><strong>Insulina:</strong> seguir orientação específica do anestesista</li>
</ul>

<h3>No Dia da Cirurgia</h3>
<ul>
    <li>Tomar banho com sabonete antisséptico (clorexidina), se fornecido</li>
    <li>Não usar esmalte nas unhas, maquiagem ou joias</li>
    <li>Vestir roupas confortáveis e fáceis de remover</li>
    <li>Trazer documentos pessoais e exames pré-operatórios</li>
    <li>Chegar ao hospital no horário informado</li>
    <li>Ter um acompanhante adulto responsável</li>
</ul>

<h3>O Que Comunicar à Equipe Médica</h3>
<ul>
    <li>Alergias a medicamentos, látex ou alimentos</li>
    <li>Uso de próteses dentárias, lentes de contato ou aparelhos auditivos</li>
    <li>Se ficou gripado ou com febre nos últimos dias</li>
    <li>Se está grávida ou com suspeita de gravidez</li>
</ul>
""",
        "content_en": """
<h2>Pre-Operative Recommendations</h2>
<p>Follow these guidelines carefully to ensure a safe surgery. If in doubt, contact the medical team.</p>

<h3>Fasting</h3>
<ul>
    <li><strong>Solid foods:</strong> absolute fasting for 8 hours before surgery</li>
    <li><strong>Clear liquids:</strong> water, tea without milk, or strained juice may be consumed up to 2 hours before (confirm with your doctor)</li>
    <li><strong>Milk and dairy:</strong> stop 6 hours before</li>
    <li><strong>Gum and candy:</strong> do not consume on surgery day</li>
</ul>

<h3>Medications</h3>
<ul>
    <li><strong>Antihypertensives:</strong> take normally with a sip of water (unless otherwise directed)</li>
    <li><strong>Anticoagulants (warfarin, rivaroxaban, etc.):</strong> stop as directed by your doctor (usually 3-7 days before)</li>
    <li><strong>Aspirin:</strong> stop 7 days before (unless otherwise directed)</li>
    <li><strong>Anti-inflammatories (ibuprofen, naproxen):</strong> stop 5 days before</li>
    <li><strong>Metformin:</strong> stop 48 hours before</li>
    <li><strong>Insulin:</strong> follow specific instructions from anesthesiologist</li>
</ul>

<h3>On Surgery Day</h3>
<ul>
    <li>Shower with antiseptic soap (chlorhexidine) if provided</li>
    <li>Do not wear nail polish, makeup, or jewelry</li>
    <li>Wear comfortable, easy-to-remove clothing</li>
    <li>Bring personal documents and pre-operative tests</li>
    <li>Arrive at the hospital at the informed time</li>
    <li>Have a responsible adult companion</li>
</ul>

<h3>What to Communicate to the Medical Team</h3>
<ul>
    <li>Allergies to medications, latex, or foods</li>
    <li>Use of dental prostheses, contact lenses, or hearing aids</li>
    <li>If you had a cold or fever in recent days</li>
    <li>If you are pregnant or suspect pregnancy</li>
</ul>
""",
        "content_es": """
<h2>Orientaciones Preoperatorias</h2>
<p>Siga estas orientaciones cuidadosamente para garantizar una cirugía segura. En caso de duda, contacte al equipo médico.</p>

<h3>Ayuno</h3>
<ul>
    <li><strong>Alimentos sólidos:</strong> ayuno absoluto de 8 horas antes de la cirugía</li>
    <li><strong>Líquidos claros:</strong> agua, té sin leche o jugo colado pueden ingerirse hasta 2 horas antes (confirme con su médico)</li>
    <li><strong>Leche y derivados:</strong> suspender 6 horas antes</li>
    <li><strong>Chicles y caramelos:</strong> no consumir el día de la cirugía</li>
</ul>

<h3>Medicamentos</h3>
<ul>
    <li><strong>Antihipertensivos:</strong> tomar normalmente con un sorbo de agua (salvo indicación contraria)</li>
    <li><strong>Anticoagulantes (warfarina, rivaroxabán, etc.):</strong> suspender según orientación médica (generalmente 3-7 días antes)</li>
    <li><strong>AAS (aspirina):</strong> suspender 7 días antes (salvo indicación contraria)</li>
    <li><strong>Antiinflamatorios (ibuprofeno, naproxeno):</strong> suspender 5 días antes</li>
    <li><strong>Metformina:</strong> suspender 48 horas antes</li>
    <li><strong>Insulina:</strong> seguir orientación específica del anestesiólogo</li>
</ul>

<h3>El Día de la Cirugía</h3>
<ul>
    <li>Ducharse con jabón antiséptico (clorhexidina), si fue proporcionado</li>
    <li>No usar esmalte de uñas, maquillaje ni joyas</li>
    <li>Usar ropa cómoda y fácil de quitar</li>
    <li>Traer documentos personales y exámenes preoperatorios</li>
    <li>Llegar al hospital en el horario informado</li>
    <li>Tener un acompañante adulto responsable</li>
</ul>

<h3>Qué Comunicar al Equipo Médico</h3>
<ul>
    <li>Alergias a medicamentos, látex o alimentos</li>
    <li>Uso de prótesis dentales, lentes de contacto o audífonos</li>
    <li>Si tuvo gripe o fiebre en los últimos días</li>
    <li>Si está embarazada o sospecha de embarazo</li>
</ul>
"""
    },

    "post_op": {
        "title_pt": "Orientações Pós-Operatórias",
        "title_en": "Post-Operative Recommendations",
        "title_es": "Orientaciones Postoperatorias",
        "specialty": "Cirurgia Geral",
        "icon": "band-aid",
        "content_pt": """
<h2>Orientações Pós-Operatórias</h2>
<p>Estas orientações visam garantir uma recuperação segura e adequada. Siga-as rigorosamente e entre em contato com a equipe médica em caso de dúvidas ou intercorrências.</p>

<h3>Repouso e Atividades</h3>
<ul>
    <li>Mantenha repouso relativo nas primeiras 24 a 48 horas</li>
    <li>Evite esforço físico intenso por pelo menos 30 dias (ou conforme orientação)</li>
    <li>Caminhadas leves são recomendadas a partir do 1o dia para prevenir trombose</li>
    <li>Não dirija veículos nas primeiras 48 horas ou enquanto usar medicações que causem sonolência</li>
    <li>Retorne às atividades laborais conforme orientação do seu médico</li>
</ul>

<h3>Alimentação</h3>
<ul>
    <li>Inicie com líquidos claros (água, chá, caldo) e evolua gradualmente para dieta normal</li>
    <li>Evite alimentos gordurosos, frituras e bebidas gaseificadas nas primeiras 48 horas</li>
    <li>Não consuma bebidas alcoólicas durante o uso de medicações</li>
    <li>Mantenha boa hidratação (pelo menos 2 litros de água/dia)</li>
</ul>

<h3>Medicações Prescritas</h3>
<ul>
    <li>Tome as medicações nos horários prescritos, mesmo que não sinta dor</li>
    <li>Não interrompa antibióticos antes do prazo, mesmo com melhora</li>
    <li>Analgésicos devem ser tomados antes que a dor se torne intensa</li>
    <li>Não tome medicamentos por conta própria sem consultar o médico</li>
</ul>

<h3>Sinais de Alerta - Procure Atendimento Imediato</h3>
<ul>
    <li>Febre acima de 38°C persistente</li>
    <li>Sangramento abundante ou que não para com compressão</li>
    <li>Dor intensa que não melhora com a medicação prescrita</li>
    <li>Vermelhidão, inchaço ou secreção com mau cheiro na ferida</li>
    <li>Náuseas e vômitos persistentes</li>
    <li>Falta de ar, dor no peito ou inchaço nas pernas</li>
</ul>

<h3>Retorno</h3>
<p>Agende seu retorno conforme orientação médica para avaliação da cicatrização e retirada de pontos (se aplicável).</p>
""",
        "content_en": """
<h2>Post-Operative Recommendations</h2>
<p>These guidelines aim to ensure a safe and proper recovery. Follow them strictly and contact the medical team if you have questions or concerns.</p>

<h3>Rest and Activities</h3>
<ul>
    <li>Maintain relative rest for the first 24 to 48 hours</li>
    <li>Avoid intense physical exertion for at least 30 days (or as directed)</li>
    <li>Light walking is recommended from day 1 to prevent blood clots</li>
    <li>Do not drive for the first 48 hours or while taking drowsiness-causing medications</li>
    <li>Return to work activities as directed by your doctor</li>
</ul>

<h3>Diet</h3>
<ul>
    <li>Start with clear liquids (water, tea, broth) and gradually progress to a normal diet</li>
    <li>Avoid fatty foods, fried foods, and carbonated beverages for the first 48 hours</li>
    <li>Do not consume alcohol while taking medications</li>
    <li>Maintain good hydration (at least 2 liters of water/day)</li>
</ul>

<h3>Prescribed Medications</h3>
<ul>
    <li>Take medications at prescribed times, even if you feel no pain</li>
    <li>Do not stop antibiotics early, even if you feel better</li>
    <li>Take pain relievers before pain becomes severe</li>
    <li>Do not take medications on your own without consulting your doctor</li>
</ul>

<h3>Warning Signs - Seek Immediate Attention</h3>
<ul>
    <li>Persistent fever above 38°C (100.4°F)</li>
    <li>Heavy bleeding that does not stop with compression</li>
    <li>Severe pain not relieved by prescribed medication</li>
    <li>Redness, swelling, or foul-smelling discharge from the wound</li>
    <li>Persistent nausea and vomiting</li>
    <li>Shortness of breath, chest pain, or leg swelling</li>
</ul>

<h3>Follow-up</h3>
<p>Schedule your follow-up appointment as directed by your doctor for wound healing assessment and suture removal (if applicable).</p>
""",
        "content_es": """
<h2>Orientaciones Postoperatorias</h2>
<p>Estas orientaciones buscan garantizar una recuperación segura y adecuada. Sígalas rigurosamente y contacte al equipo médico en caso de dudas o complicaciones.</p>

<h3>Reposo y Actividades</h3>
<ul>
    <li>Mantenga reposo relativo las primeras 24 a 48 horas</li>
    <li>Evite esfuerzo físico intenso por al menos 30 días (o según indicación)</li>
    <li>Caminatas ligeras son recomendadas desde el 1er día para prevenir trombosis</li>
    <li>No conduzca vehículos las primeras 48 horas o mientras use medicamentos que causen somnolencia</li>
    <li>Retorne a las actividades laborales según orientación de su médico</li>
</ul>

<h3>Alimentación</h3>
<ul>
    <li>Inicie con líquidos claros (agua, té, caldo) y evolucione gradualmente a dieta normal</li>
    <li>Evite alimentos grasos, frituras y bebidas gaseosas las primeras 48 horas</li>
    <li>No consuma bebidas alcohólicas durante el uso de medicamentos</li>
    <li>Mantenga buena hidratación (al menos 2 litros de agua/día)</li>
</ul>

<h3>Medicamentos Prescritos</h3>
<ul>
    <li>Tome los medicamentos en los horarios prescritos, aunque no sienta dolor</li>
    <li>No interrumpa antibióticos antes del plazo, incluso con mejoría</li>
    <li>Los analgésicos deben tomarse antes de que el dolor se vuelva intenso</li>
    <li>No tome medicamentos por cuenta propia sin consultar al médico</li>
</ul>

<h3>Señales de Alerta - Busque Atención Inmediata</h3>
<ul>
    <li>Fiebre por encima de 38°C persistente</li>
    <li>Sangrado abundante que no para con compresión</li>
    <li>Dolor intenso que no mejora con la medicación prescrita</li>
    <li>Enrojecimiento, hinchazón o secreción con mal olor en la herida</li>
    <li>Náuseas y vómitos persistentes</li>
    <li>Falta de aire, dolor en el pecho o hinchazón en las piernas</li>
</ul>

<h3>Retorno</h3>
<p>Agende su retorno según orientación médica para evaluación de la cicatrización y retiro de puntos (si aplica).</p>
"""
    },

    "wound_care": {
        "title_pt": "Cuidados com a Ferida Operatória",
        "title_en": "Surgical Wound Care",
        "title_es": "Cuidados con la Herida Operatoria",
        "specialty": "Cirurgia Geral",
        "icon": "band-aid",
        "content_pt": """
<h2>Cuidados com a Ferida Operatória</h2>
<p>Os cuidados adequados com a ferida cirúrgica são essenciais para prevenir infecções e garantir boa cicatrização.</p>

<h3>Curativo</h3>
<ul>
    <li>Mantenha o curativo original por 24 a 48 horas (ou conforme orientação)</li>
    <li>Após esse período, troque o curativo diariamente ou sempre que sujo/úmido</li>
    <li>Lave as mãos com água e sabão antes de manipular o curativo</li>
    <li>Limpe a ferida com soro fisiológico ou água corrente limpa</li>
    <li>Seque suavemente com gaze estéril (não esfregue)</li>
    <li>Aplique o curativo prescrito (gaze, micropore, ou conforme orientação)</li>
</ul>

<h3>Banho</h3>
<ul>
    <li>Pode tomar banho normalmente após 24-48 horas (exceto se contraindicado)</li>
    <li>Lave a ferida suavemente com água e sabão neutro</li>
    <li>Não esfregue a ferida com bucha ou toalha</li>
    <li>Seque bem a região ao redor da ferida após o banho</li>
    <li>Não mergulhe em piscina, banheira ou mar até liberação médica</li>
</ul>

<h3>Cuidados Gerais</h3>
<ul>
    <li>Não coce ou manipule a ferida</li>
    <li>Proteja a ferida do sol por pelo menos 6 meses (usar protetor solar FPS 50+)</li>
    <li>Não aplique pomadas, cremes ou produtos caseiros sem orientação médica</li>
    <li>Use roupas confortáveis que não apertem a região operada</li>
    <li>Se houver pontos, eles serão retirados em consulta de retorno (geralmente 7-14 dias)</li>
</ul>

<h3>Sinais de Infecção - Procure o Médico</h3>
<ul>
    <li>Vermelhidão que aumenta ao redor da ferida</li>
    <li>Inchaço progressivo ou endurecimento local</li>
    <li>Secreção amarelada ou esverdeada (pus)</li>
    <li>Aumento da dor no local da ferida</li>
    <li>Febre acima de 37,8°C</li>
    <li>Bordas da ferida se abrindo (deiscência)</li>
</ul>
""",
        "content_en": """
<h2>Surgical Wound Care</h2>
<p>Proper surgical wound care is essential to prevent infections and ensure good healing.</p>

<h3>Dressing</h3>
<ul>
    <li>Keep the original dressing for 24 to 48 hours (or as directed)</li>
    <li>After this period, change the dressing daily or whenever dirty/wet</li>
    <li>Wash hands with soap and water before handling the dressing</li>
    <li>Clean the wound with saline solution or clean running water</li>
    <li>Gently dry with sterile gauze (do not rub)</li>
    <li>Apply the prescribed dressing (gauze, tape, or as directed)</li>
</ul>

<h3>Bathing</h3>
<ul>
    <li>You may shower normally after 24-48 hours (unless contraindicated)</li>
    <li>Gently wash the wound with water and mild soap</li>
    <li>Do not scrub the wound with a sponge or towel</li>
    <li>Dry the area around the wound well after bathing</li>
    <li>Do not submerge in pools, bathtubs, or the ocean until cleared by your doctor</li>
</ul>

<h3>General Care</h3>
<ul>
    <li>Do not scratch or manipulate the wound</li>
    <li>Protect the wound from sun for at least 6 months (use SPF 50+ sunscreen)</li>
    <li>Do not apply ointments, creams, or home remedies without medical guidance</li>
    <li>Wear comfortable clothing that does not press on the operated area</li>
    <li>If sutures are present, they will be removed at follow-up (usually 7-14 days)</li>
</ul>

<h3>Signs of Infection - Contact Your Doctor</h3>
<ul>
    <li>Increasing redness around the wound</li>
    <li>Progressive swelling or hardening at the site</li>
    <li>Yellowish or greenish discharge (pus)</li>
    <li>Increasing pain at the wound site</li>
    <li>Fever above 37.8°C (100°F)</li>
    <li>Wound edges opening (dehiscence)</li>
</ul>
""",
        "content_es": """
<h2>Cuidados con la Herida Operatoria</h2>
<p>Los cuidados adecuados con la herida quirúrgica son esenciales para prevenir infecciones y garantizar buena cicatrización.</p>

<h3>Curación</h3>
<ul>
    <li>Mantenga la curación original por 24 a 48 horas (o según indicación)</li>
    <li>Después de ese período, cambie la curación diariamente o cuando esté sucia/húmeda</li>
    <li>Lávese las manos con agua y jabón antes de manipular la curación</li>
    <li>Limpie la herida con solución fisiológica o agua corriente limpia</li>
    <li>Seque suavemente con gasa estéril (no frote)</li>
    <li>Aplique la curación prescrita (gasa, micropore o según indicación)</li>
</ul>

<h3>Baño</h3>
<ul>
    <li>Puede ducharse normalmente después de 24-48 horas (salvo contraindicación)</li>
    <li>Lave la herida suavemente con agua y jabón neutro</li>
    <li>No frote la herida con esponja o toalla</li>
    <li>Seque bien la región alrededor de la herida después del baño</li>
    <li>No se sumerja en piscina, bañera o mar hasta autorización médica</li>
</ul>

<h3>Cuidados Generales</h3>
<ul>
    <li>No se rasque ni manipule la herida</li>
    <li>Proteja la herida del sol por al menos 6 meses (usar protector solar FPS 50+)</li>
    <li>No aplique pomadas, cremas o productos caseros sin orientación médica</li>
    <li>Use ropa cómoda que no apriete la región operada</li>
    <li>Si hay puntos, serán retirados en consulta de retorno (generalmente 7-14 días)</li>
</ul>

<h3>Señales de Infección - Consulte al Médico</h3>
<ul>
    <li>Enrojecimiento que aumenta alrededor de la herida</li>
    <li>Hinchazón progresiva o endurecimiento local</li>
    <li>Secreción amarillenta o verdosa (pus)</li>
    <li>Aumento del dolor en el sitio de la herida</li>
    <li>Fiebre por encima de 37.8°C</li>
    <li>Bordes de la herida abriéndose (dehiscencia)</li>
</ul>
"""
    },

    "medication_guidance": {
        "title_pt": "Orientações sobre Uso de Medicamentos",
        "title_en": "Medication Use Guidelines",
        "title_es": "Orientaciones sobre Uso de Medicamentos",
        "specialty": "Clínica Geral",
        "icon": "pills",
        "content_pt": """
<h2>Orientações sobre Uso de Medicamentos</h2>
<p>O uso correto dos medicamentos é fundamental para o sucesso do tratamento. Siga estas orientações gerais e sempre respeite a prescrição do seu médico.</p>

<h3>Regras Gerais</h3>
<ul>
    <li>Tome os medicamentos nos horários prescritos, mantendo intervalos regulares</li>
    <li>Não altere doses ou interrompa o tratamento sem consultar o médico</li>
    <li>Se esquecer uma dose, tome assim que lembrar. Se estiver próximo da próxima dose, pule a esquecida</li>
    <li>Não tome dose dobrada para compensar uma dose esquecida</li>
    <li>Armazene os medicamentos em local seco, fresco e ao abrigo da luz solar</li>
</ul>

<h3>Tabela de Medicamentos</h3>
<table>
    <thead>
        <tr>
            <th>Medicamento</th>
            <th>Dose</th>
            <th>Horário</th>
            <th>Antes/Depois da Refeição</th>
            <th>Observações</th>
        </tr>
    </thead>
    <tbody>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody>
</table>

<h3>Interações Importantes</h3>
<ul>
    <li><strong>Álcool:</strong> evite bebidas alcoólicas durante o uso de antibióticos, analgésicos e anti-inflamatórios</li>
    <li><strong>Antiácidos:</strong> podem reduzir a absorção de diversos medicamentos. Tome com intervalo de 2 horas</li>
    <li><strong>Alimentos:</strong> alguns medicamentos devem ser tomados em jejum, outros com alimentos. Siga a orientação específica</li>
    <li><strong>Outros medicamentos:</strong> informe ao médico todos os medicamentos que utiliza, incluindo fitoterápicos e suplementos</li>
</ul>

<h3>Efeitos Colaterais</h3>
<p>Informe seu médico se apresentar qualquer efeito colateral, como:</p>
<ul>
    <li>Náuseas, vômitos ou diarreia persistentes</li>
    <li>Reações alérgicas (urticária, inchaço, dificuldade respiratória)</li>
    <li>Tontura, sonolência excessiva ou confusão mental</li>
    <li>Sangramento ou hematomas incomuns</li>
</ul>

<p><strong>Em caso de reação alérgica grave (dificuldade para respirar, inchaço de rosto/garganta), procure o pronto-socorro imediatamente.</strong></p>
""",
        "content_en": """
<h2>Medication Use Guidelines</h2>
<p>Correct medication use is essential for treatment success. Follow these general guidelines and always respect your doctor's prescription.</p>

<h3>General Rules</h3>
<ul>
    <li>Take medications at prescribed times, maintaining regular intervals</li>
    <li>Do not change doses or stop treatment without consulting your doctor</li>
    <li>If you miss a dose, take it as soon as you remember. If close to the next dose, skip the missed one</li>
    <li>Do not take a double dose to make up for a missed one</li>
    <li>Store medications in a dry, cool place away from sunlight</li>
</ul>

<h3>Medication Table</h3>
<table>
    <thead>
        <tr>
            <th>Medication</th>
            <th>Dose</th>
            <th>Time</th>
            <th>Before/After Meals</th>
            <th>Notes</th>
        </tr>
    </thead>
    <tbody>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody>
</table>

<h3>Important Interactions</h3>
<ul>
    <li><strong>Alcohol:</strong> avoid alcoholic beverages while taking antibiotics, pain relievers, and anti-inflammatories</li>
    <li><strong>Antacids:</strong> may reduce absorption of various medications. Take with a 2-hour interval</li>
    <li><strong>Food:</strong> some medications should be taken on an empty stomach, others with food. Follow specific instructions</li>
    <li><strong>Other medications:</strong> inform your doctor of all medications you use, including herbal remedies and supplements</li>
</ul>

<h3>Side Effects</h3>
<p>Inform your doctor if you experience any side effects, such as:</p>
<ul>
    <li>Persistent nausea, vomiting, or diarrhea</li>
    <li>Allergic reactions (hives, swelling, difficulty breathing)</li>
    <li>Dizziness, excessive drowsiness, or mental confusion</li>
    <li>Unusual bleeding or bruising</li>
</ul>

<p><strong>In case of severe allergic reaction (difficulty breathing, swelling of face/throat), go to the emergency room immediately.</strong></p>
""",
        "content_es": """
<h2>Orientaciones sobre Uso de Medicamentos</h2>
<p>El uso correcto de los medicamentos es fundamental para el éxito del tratamiento. Siga estas orientaciones generales y siempre respete la prescripción de su médico.</p>

<h3>Reglas Generales</h3>
<ul>
    <li>Tome los medicamentos en los horarios prescritos, manteniendo intervalos regulares</li>
    <li>No altere dosis ni interrumpa el tratamiento sin consultar al médico</li>
    <li>Si olvida una dosis, tómela tan pronto como recuerde. Si está cerca de la próxima dosis, omita la olvidada</li>
    <li>No tome dosis doble para compensar una dosis olvidada</li>
    <li>Almacene los medicamentos en lugar seco, fresco y protegido de la luz solar</li>
</ul>

<h3>Tabla de Medicamentos</h3>
<table>
    <thead>
        <tr>
            <th>Medicamento</th>
            <th>Dosis</th>
            <th>Horario</th>
            <th>Antes/Después de Comida</th>
            <th>Observaciones</th>
        </tr>
    </thead>
    <tbody>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td><td></td><td></td></tr>
    </tbody>
</table>

<h3>Interacciones Importantes</h3>
<ul>
    <li><strong>Alcohol:</strong> evite bebidas alcohólicas durante el uso de antibióticos, analgésicos y antiinflamatorios</li>
    <li><strong>Antiácidos:</strong> pueden reducir la absorción de diversos medicamentos. Tome con intervalo de 2 horas</li>
    <li><strong>Alimentos:</strong> algunos medicamentos deben tomarse en ayunas, otros con alimentos. Siga la orientación específica</li>
    <li><strong>Otros medicamentos:</strong> informe al médico todos los medicamentos que utiliza, incluyendo fitoterapéuticos y suplementos</li>
</ul>

<h3>Efectos Secundarios</h3>
<p>Informe a su médico si presenta algún efecto secundario, como:</p>
<ul>
    <li>Náuseas, vómitos o diarrea persistentes</li>
    <li>Reacciones alérgicas (urticaria, hinchazón, dificultad respiratoria)</li>
    <li>Mareo, somnolencia excesiva o confusión mental</li>
    <li>Sangrado o hematomas inusuales</li>
</ul>

<p><strong>En caso de reacción alérgica grave (dificultad para respirar, hinchazón de cara/garganta), acuda a urgencias inmediatamente.</strong></p>
"""
    }
}
