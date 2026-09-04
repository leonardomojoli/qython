// Configuração única do worker do pdf.js usado pelo react-pdf.
//
// Importe `pdfjs` daqui (não direto de 'react-pdf') em qualquer componente que
// renderize <Document>/<Page>. Assim o worker é configurado em UM lugar só.
//
// ⚠️ GOTCHA DURÁVEL (já quebrou 2×: commits acf60484 e este):
// o pdf.js valida `apiVersion === workerVersion` no handshake do worker e LANÇA
// "The API version "X" does not match the Worker version "Y"." ANTES de baixar o
// PDF → react-pdf mostra "Erro ao carregar o documento" e NENHUMA requisição do
// arquivo chega ao servidor (0 hits no nginx).
//
// `import { pdfjs } from 'react-pdf'` usa o pdfjs-dist ANINHADO do react-pdf (a API).
// `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` resolve o
// pdfjs-dist HOISTED do workspace (o worker). Se forem versões diferentes → mismatch.
// Por isso o pdfjs-dist é TRAVADO numa única versão (== a do react-pdf) via:
//   - packages/web/package.json: "pdfjs-dist" e "react-pdf" em versão EXATA
//   - package.json (raiz): "overrides": { "pdfjs-dist": "<versão>" }
// Ao atualizar o react-pdf, alinhar os três (pin do web + override) na versão de
// pdfjs-dist que o novo react-pdf fixa, senão o viewer volta a quebrar.
import { pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export { pdfjs };
