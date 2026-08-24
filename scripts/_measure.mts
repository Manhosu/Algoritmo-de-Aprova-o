import { readFileSync } from "node:fs";
import { extractText, getDocumentProxy } from "unpdf";
const bytes = readFileSync(process.argv[2]);
const pdf = await getDocumentProxy(new Uint8Array(bytes));
const { totalPages, text } = await extractText(pdf, { mergePages: false });
const pages = text as string[];
const est = (s: string) => Math.round(s.length / 3.6);

// Onde comeca e onde termina o anexo de conteudo programatico?
const START = /conte[úu]do\s+program[áa]tico|objetos?\s+de\s+avalia[çc][ãa]o|programa\s+das?\s+provas?/i;
const ANNEX = /^\s*ANEXO\s+([IVXLC]+|\d+)/im;

pages.forEach((p, i) => {
  const m = p.match(ANNEX);
  if (m) console.log(`pg ${String(i+1).padStart(2)}: ${m[0].trim()} — ${p.slice(m.index!, m.index!+70).replace(/\s+/g," ")}`);
});

const start = pages.findIndex((p) => START.test(p));
// Termina no proximo ANEXO diferente do que comecou.
let end = totalPages;
const firstAnnex = pages[start]?.match(ANNEX)?.[1];
for (let i = start + 1; i < totalPages; i++) {
  const m = pages[i].match(ANNEX);
  if (m && m[1] !== firstAnnex) { end = i; break; }
}
const slice = pages.slice(start, end).join("\n\n");
console.log(`\nanexo do conteudo: paginas ${start+1} a ${end} (${end-start} paginas)`);
console.log(`${slice.length.toLocaleString("pt-BR")} chars ~ ${est(slice).toLocaleString("pt-BR")} tokens`);
console.log(`reducao vs PDF inteiro (262.214): ${(262214/est(slice)).toFixed(0)}x`);
console.log(`\n--- fim do trecho ---\n${slice.slice(-300)}`);
process.exit(0);
