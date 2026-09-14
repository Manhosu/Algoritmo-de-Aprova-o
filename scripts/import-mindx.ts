import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * IMPORTA OS VÍDEOS DO MIND-X.
 *
 *   npx tsx --conditions=react-server scripts/import-mindx.ts "<pasta>"
 *   ... --confirmar     para gravar de verdade
 *
 * Sem `--confirmar` ele só mostra o que faria: disciplina, assunto e situação de
 * cada arquivo. É a única chance de ver que "CF - Habeas Data" caiu no assunto
 * errado ANTES de cinquenta vídeos entrarem no feed dos alunos.
 *
 * ⚠️ O NOME DO ARQUIVO É O ÚNICO METADADO QUE ESTES VÍDEOS TÊM.
 *
 * Ela nomeia por convenção: "CF - Habeas Corpus", "Português - Crase",
 * "ADM - Modalidades de Licitação 2". O prefixo é a disciplina, o resto é o
 * assunto. Sem esse casamento, o vídeo entra no acervo e nunca aparece para
 * ninguém: o feed recorta pelo edital do aluno, e um vídeo sem assunto e sem
 * disciplina não pertence ao edital de nenhum.
 *
 * ⚠️ IDEMPOTENTE por (tipo, título, ordem). Rodar de novo substitui o arquivo em
 * vez de criar um segundo item.
 */

const [, , pasta, ...flags] = process.argv;
const CONFIRMAR = flags.includes("--confirmar");
/**
 * ⚠️ VÍDEO SEM DISCIPLINA FICA DE FORA POR PADRÃO.
 *
 * Sete arquivos chamados "Sem título 2026-08-27 22.25.19" e oito "WhatsApp
 * Video 2026-09-01 at 10.37.04" não têm como ser classificados pelo nome. Eles
 * somam 90 MB e nunca apareceriam no feed, que recorta pelo edital. Importados,
 * virariam quinze linhas ilegíveis na lista de materiais dela e espaço pago no
 * armazenamento.
 *
 * A saída certa é renomeá-los na convenção "Disciplina - Assunto" e rodar de
 * novo. Quem quiser subir mesmo assim, como rascunho, usa a bandeira.
 */
const INCLUIR_SEM_DISCIPLINA = flags.includes("--incluir-sem-disciplina");

if (!pasta) {
  throw new Error(
    'Uso: npx tsx --conditions=react-server scripts/import-mindx.ts "<pasta>" [--confirmar]',
  );
}

const { identifyMedia } = await import("../src/server/import/media");
const { db } = await import("../src/server/db");
const { contentItems } = await import("../src/server/db/schema");
const { putContentFile } = await import("../src/server/storage");
const { loadCatalog, matchSubject, matchTopic } = await import(
  "../src/server/taxonomy/mapping"
);
const { eq } = await import("drizzle-orm");
const { taxonomyKey } = await import("../src/modules/taxonomy/normalize");

/**
 * As abreviações que ela usa nos nomes dos arquivos.
 *
 * ⚠️ NÃO DÁ PARA DEIXAR ISSO PARA O CASADOR POR SIMILARIDADE.
 *
 * "CF" tem duas letras. Comparado com "Direito Constitucional" a semelhança é
 * quase zero, e comparado com o catálogo inteiro ele casaria com qualquer coisa
 * de duas ou três letras. Abreviação é sinônimo exato, não aproximação — e
 * sinônimo exato é tabela, não algoritmo.
 */
const ABREVIACOES: Record<string, string> = {
  cf: "Direito Constitucional",
  adm: "Direito Administrativo",
  administracao: "Direito Administrativo",
  "direito adm": "Direito Administrativo",
  portugues: "Língua Portuguesa",
  matematica: "Matemática",
  rlm: "Raciocínio Lógico",
  info: "Informática",
};

/**
 * O jeito dela nomear, traduzido para o vocabulário do catálogo.
 *
 * ⚠️ ISTO NÃO É SINÔNIMO DE CATÁLOGO, e por isso não está em `catalog-data`.
 *
 * "Culpado" e "Casa asilo inviolavel" são títulos de vídeo, não linhas de
 * edital. Cadastrá-los como sinônimo faria a palavra "culpado", solta em
 * qualquer edital, casar com presunção de inocência — um casamento errado que
 * apareceria em silêncio para todo aluno. Aqui eles só valem para os arquivos
 * desta pasta.
 */
const APELIDOS_DE_ARQUIVO: Record<string, string> = {
  "casa asilo inviolavel": "Inviolabilidade do domicílio",
  culpado: "Presunção de inocência",
  reuniao: "Liberdade de reunião",
  associacao: "Liberdade de associação",
  "voto obrigatorio": "Direitos políticos",

  /*
    Os renomeados de 10/09/2026. Casados em 14/09 olhando o vídeo, e não só o
    nome: "Cargos Privativos" é Presidente e Vice como cargos de brasileiro nato
    (nacionalidade, art. 12), "Forma de Estado" é Federação, República e
    Democracia (art. 1º), "2 cargos" é a acumulação do art. 37.

    ⚠️ SEM ESTAS LINHAS, RODAR O IMPORTADOR DE NOVO DESFAZ O CASAMENTO. Ele grava
    `canonicalTopicId` nulo em quem não casa, e o vídeo volta a valer só pela
    disciplina. "Principio da Legalidade" fica de fora de propósito: o vídeo não
    diz se é o art. 5º ou o art. 37.
  */
  "2 cargos": "Administração Pública na Constituição",
  "concurso publico": "Administração Pública na Constituição",
  "cargos privativos": "Direitos e garantias fundamentais",
  desapropriacao: "Direitos e garantias fundamentais",
  "direito de peticao": "Direitos e garantias fundamentais",
  "direito de silencio": "Direitos e garantias fundamentais",
  "lei penal": "Direitos e garantias fundamentais",
  "plebiscito e referendo": "Direitos e garantias fundamentais",
  preso: "Direitos e garantias fundamentais",
  "prisao por divida": "Direitos e garantias fundamentais",
  propriedade: "Direitos e garantias fundamentais",
  "provas ilicitas": "Direitos e garantias fundamentais",
  voto: "Direitos e garantias fundamentais",
  "forma de estado": "Princípios fundamentais",
  "fundamentos da republica": "Princípios fundamentais",
  "principios relacoes internacionais": "Princípios fundamentais",
  "cargo em comissao e funcao de confianca": "Cargo, emprego e função pública",
  concurso: "Agentes públicos",
  etp: "Estudo Técnico Preliminar",
  tr: "Termo de referência",
  "juros simples": "Juros simples e compostos",
};

/** A mesma normalização do casador — acento, caixa e pontuação fora. */
const chave = taxonomyKey;

/*
  ⚠️ AS CHAVES DOS APELIDOS PASSAM PELA MESMA NORMALIZAÇÃO. Escritas à mão, elas
  guardam o "de", o "da" e o número que o casador tira: "direito de peticao"
  nunca era encontrado, e oito vídeos ficavam só com a disciplina sem aviso.
*/
const APELIDOS = new Map(
  Object.entries(APELIDOS_DE_ARQUIVO).map(([apelido, assunto]) => [chave(apelido), assunto]),
);

/**
 * Separa "CF - Habeas Corpus(1).mp4" em disciplina, assunto e ordem.
 *
 * ⚠️ O "(1)" NO FIM É ORDEM, NÃO PARTE DO NOME.
 *
 * O Drive numera assim quando dois arquivos têm o mesmo nome, e ela tem sete
 * vídeos de Ortografia. Mantendo o sufixo no título, o casamento de assunto
 * falharia nos sete; jogando-o fora, os sete viram o mesmo item e seis
 * desapareceriam por cima do primeiro. Ele vira `sortOrder`, que participa da
 * chave de idempotência.
 */
function separar(nomeDoArquivo: string): {
  disciplina: string | null;
  assunto: string;
  /** O assunto sem o número que ela escreveu no fim, quando havia um. */
  assuntoSemSerie: string;
  ordem: number;
} {
  let nome = nomeDoArquivo.replace(/\.(mp4|mov|webm|m4v)$/i, "").trim();

  let ordem = 0;

  /* "(1)" ou " (1)" no fim — o desempate do Drive, nunca parte do assunto. */
  const duplicado = nome.match(/^(.*?)\s*\((\d{1,2})\)$/);
  if (duplicado) {
    nome = duplicado[1].trim();
    ordem = Number.parseInt(duplicado[2], 10);
  }

  const separado = nome.match(/^(.{2,30}?)\s+-\s+(.+)$/);
  const disciplina = separado ? separado[1].trim() : null;
  const assunto = separado ? separado[2].trim() : nome;

  /*
    ⚠️ O NÚMERO NO FIM SÓ SAI SE O NOME INTEIRO NÃO CASAR PRIMEIRO.

    "Modalidades de Licitação 2" é o segundo vídeo do mesmo assunto, e o "2"
    precisa sair. "Regra de 3" é o NOME do assunto, e tirar o "3" deixa "Regra
    de" — que não casa com nada. A regra sozinha não distingue os dois casos; só
    o catálogo distingue. Por isso as duas formas voltam daqui e quem escolhe é
    o casamento.
  */
  const serie = assunto.match(/^(.*\S)\s+(\d{1,2})$/);

  return {
    disciplina,
    assunto,
    assuntoSemSerie: serie ? serie[1].trim() : assunto,
    ordem: ordem || (serie ? Number.parseInt(serie[2], 10) : 0),
  };
}

async function listar(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { withFileTypes: true });
  const arquivos: string[] = [];

  for (const entrada of entradas) {
    const completo = join(dir, entrada.name);
    if (entrada.isDirectory()) arquivos.push(...(await listar(completo)));
    else arquivos.push(completo);
  }

  return arquivos.sort();
}

const catalogo = await loadCatalog();
const arquivos = await listar(pasta);

console.log(`\nPasta: ${pasta}`);
console.log(`Arquivos encontrados: ${arquivos.length}\n`);

type Planejado = {
  caminho: string;
  titulo: string;
  ordem: number;
  bytes: Uint8Array;
  mimeType: "video/mp4" | "video/webm";
  subjectId: string | null;
  topicId: string | null;
  rotulo: string;
};

const planejados: Planejado[] = [];
const ignorados: string[] = [];

for (const caminho of arquivos) {
  const info = await stat(caminho);
  if (info.size === 0) {
    ignorados.push(`${basename(caminho)} — arquivo vazio`);
    continue;
  }

  const bytes = new Uint8Array(await readFile(caminho));
  const media = identifyMedia(bytes);

  if (!media || (media.mimeType !== "video/mp4" && media.mimeType !== "video/webm")) {
    /*
      A pasta traz também os PNGs do mascote. Eles não são conteúdo de estudo e
      entrariam no feed como vídeo quebrado — ficam de fora, e o relatório diz
      quantos foram, para ninguém achar que sumiram.
    */
    ignorados.push(`${basename(caminho)} — não é vídeo (${media?.mimeType ?? "formato desconhecido"})`);
    continue;
  }

  const { disciplina, assunto, assuntoSemSerie, ordem } = separar(basename(caminho));

  let subjectId: string | null = null;

  if (disciplina) {
    const apelido = ABREVIACOES[chave(disciplina)];
    subjectId = matchSubject(apelido ?? disciplina, catalogo).canonicalId;
  }

  /*
    Três tentativas, da mais específica para a mais tolerante: o apelido de
    arquivo, o nome inteiro, e só então o nome sem o número da série.
  */
  const candidatos = [
    APELIDOS.get(chave(assunto)),
    assunto,
    assuntoSemSerie !== assunto ? assuntoSemSerie : null,
  ].filter((valor): valor is string => Boolean(valor));

  let casamentoDeAssunto = matchTopic(candidatos[0], subjectId, catalogo);
  for (const candidato of candidatos.slice(1)) {
    if (casamentoDeAssunto.canonicalId) break;
    casamentoDeAssunto = matchTopic(candidato, subjectId, catalogo);
  }

  const topicId = casamentoDeAssunto.canonicalId;

  /*
    Quando o assunto casou, a disciplina DELE é a verdade — o prefixo do arquivo
    é uma pista, e o catálogo é o cadastro. Foi assim que os mapas mentais
    acabaram na disciplina certa mesmo vindo de pastas misturadas.
  */
  const assuntoCanonico = topicId ? catalogo.topics.find((t) => t.id === topicId) : undefined;
  const disciplinaFinal = assuntoCanonico?.subjectId ?? subjectId;

  if (!disciplinaFinal && !INCLUIR_SEM_DISCIPLINA) {
    ignorados.push(`${basename(caminho)} — sem disciplina no nome do arquivo`);
    continue;
  }

  planejados.push({
    caminho,
    /*
      ⚠️ O TÍTULO SÓ VIRA O NOME CANÔNICO quando os dois são a MESMA palavra
      escrita de jeitos diferentes.

      Ela tem "Ortografia" e "ortografia", "Concordância Verbal" e "Concordância
      verbal" — normalizar a caixa aí evita dois nomes para a mesma coisa na
      biblioteca. Mas dez vídeos de CF casam todos com o assunto "Direitos e
      garantias fundamentais": adotar o nome canônico transformaria "Habeas
      Corpus", "Habeas Data" e "Mandado de Segurança" em dez itens de título
      idêntico, e nove desapareceriam por cima do primeiro na regravação.
    */
    titulo: (assuntoCanonico && chave(assuntoCanonico.name) === chave(assunto)
      ? assuntoCanonico.name
      : assunto
    ).slice(0, 240),
    ordem,
    bytes,
    mimeType: media.mimeType,
    subjectId: disciplinaFinal,
    topicId,
    rotulo: topicId
      ? `assunto casou (${casamentoDeAssunto.matchedBy})`
      : subjectId
        ? "só disciplina"
        : "SEM DISCIPLINA",
  });
}

for (const item of planejados) {
  console.log(
    `  ${String(item.ordem).padStart(2)} · ${item.titulo.slice(0, 46).padEnd(46)} ${item.rotulo}`,
  );
}

if (ignorados.length > 0) {
  console.log(`\nIgnorados (${ignorados.length}):`);
  for (const linha of ignorados) console.log(`  ${linha}`);
}

const semDisciplina = planejados.filter((p) => !p.subjectId).length;
const semAssunto = planejados.filter((p) => p.subjectId && !p.topicId).length;

console.log(
  `\nTotal: ${planejados.length} vídeos` +
    ` · ${planejados.length - semDisciplina - semAssunto} com assunto` +
    ` · ${semAssunto} só com disciplina` +
    ` · ${semDisciplina} sem nada (entram como rascunho)`,
);

if (!CONFIRMAR) {
  console.log("\nNada foi gravado. Rode de novo com --confirmar.\n");
  process.exit(0);
}

console.log("\nImportando...\n");

let criados = 0;
let substituidos = 0;

for (const item of planejados) {
  /*
    ⚠️ VÍDEO SEM DISCIPLINA ENTRA COMO RASCUNHO, e isso não é cautela vazia.

    "Seja bem vindo - Algoritmo da Aprovação" e "Sem título 2026-08-27" não
    pertencem a assunto nenhum. Publicados, eles ocupariam vaga no acervo e não
    apareceriam para aluno nenhum — o pior dos dois mundos: parecem publicados
    no painel e são invisíveis na prática. Como rascunho, ficam visíveis na lista
    de materiais esperando que alguém diga a que disciplina pertencem.
  */
  const situacao = item.subjectId ? "published" : "draft";

  const existente = await db.query.contentItems.findFirst({
    where: (t, { and: e, eq: is, isNull: n }) =>
      e(is(t.type, "mindx"), is(t.title, item.titulo), is(t.sortOrder, item.ordem), n(t.deletedAt)),
    columns: { id: true },
  });

  const itemId =
    existente?.id ??
    (
      await db
        .insert(contentItems)
        .values({
          type: "mindx",
          title: item.titulo,
          canonicalSubjectId: item.subjectId,
          canonicalTopicId: item.topicId,
          /*
            ⚠️ `limited`: o Mind-X é a porta de entrada, não o produto pago.

            Ele abre no botão central da barra, antes de qualquer decisão de
            plano. Trancado no Premium, o aluno do Free tocaria no botão mais
            visível do aplicativo para encontrar uma tela vazia.
          */
          requiredAccessLevel: "limited",
          status: situacao,
          sortOrder: item.ordem,
          publishedAt: situacao === "published" ? new Date() : null,
        })
        .returning({ id: contentItems.id })
    )[0].id;

  const gravado = await putContentFile({
    contentItemId: itemId,
    mimeType: item.mimeType,
    bytes: item.bytes,
  });

  await db
    .update(contentItems)
    .set({
      storagePath: gravado.storagePath,
      fileSizeBytes: gravado.sizeBytes,
      canonicalSubjectId: item.subjectId,
      canonicalTopicId: item.topicId,
      sortOrder: item.ordem,
      status: situacao,
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, itemId));

  if (existente) substituidos += 1;
  else criados += 1;

  console.log(`  ✓ ${item.titulo.slice(0, 50).padEnd(50)} ${situacao}`);
}

console.log(`\nNovos: ${criados} · substituídos: ${substituidos}\n`);
