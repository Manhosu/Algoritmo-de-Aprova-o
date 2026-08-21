import type { LegalDocumentView } from "@/server/legal/documents";

/**
 * Renderiza um documento legal guardado como Markdown no banco.
 *
 * ⚠️ NÃO usa `dangerouslySetInnerHTML` nem uma biblioteca de Markdown que gere
 * HTML cru. O conteúdo é editável pelo painel administrativo, e um documento
 * legal renderizado como HTML arbitrário seria um caminho de XSS a partir de
 * uma conta de administrador comprometida — numa página que TODO visitante
 * abre, inclusive antes de logar.
 *
 * O subconjunto renderizado é o que um documento legal precisa: títulos,
 * parágrafos, listas, tabelas, negrito, citação e código. Qualquer outra coisa
 * aparece como texto puro, que é o comportamento seguro.
 */
export function LegalDocument({ document }: { document: LegalDocumentView }) {
  const blocks = parseMarkdown(document.content);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{document.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Versão {document.version} · em vigor desde{" "}
          <time dateTime={document.effectiveFrom.toISOString()}>
            {document.effectiveFrom.toLocaleDateString("pt-BR")}
          </time>
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {blocks.map((block, index) => (
          <Block key={index} block={block} />
        ))}
      </div>
    </article>
  );
}

/* ========================================================================== *
 * RENDERIZAÇÃO
 * ========================================================================== */

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "table"; header: string[]; rows: string[][] };

function Block({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading": {
      if (block.level === 1) {
        return (
          <h2 className="mt-6 text-xl font-bold text-foreground">
            <Inline text={block.text} />
          </h2>
        );
      }
      if (block.level === 2) {
        return (
          <h3 className="mt-5 text-lg font-semibold text-foreground">
            <Inline text={block.text} />
          </h3>
        );
      }
      return (
        <h4 className="mt-4 font-semibold text-foreground">
          <Inline text={block.text} />
        </h4>
      );
    }

    case "paragraph":
      return (
        <p className="text-pretty text-muted-foreground">
          <Inline text={block.text} />
        </p>
      );

    case "list":
      return (
        <ul className="ml-5 flex list-disc flex-col gap-1.5 text-muted-foreground marker:text-primary">
          {block.items.map((item, index) => (
            <li key={index} className="text-pretty">
              <Inline text={item} />
            </li>
          ))}
        </ul>
      );

    case "quote":
      return (
        <blockquote className="border-l-2 border-primary/60 bg-surface/40 py-3 pl-4 text-sm text-pretty text-muted-foreground">
          <Inline text={block.text} />
        </blockquote>
      );

    case "table":
      return (
        // A tabela rola dentro do próprio contêiner: sem isso, uma tabela larga
        // faz a PÁGINA inteira rolar de lado no celular.
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                {block.header.map((cell, index) => (
                  <th key={index} className="px-3 py-2 text-left font-semibold text-foreground">
                    <Inline text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border/60">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-2 align-top text-muted-foreground">
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Só negrito e código. Tudo o mais fica como texto. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={index} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={index} className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

/* ========================================================================== *
 * PARSER
 * ========================================================================== */

function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  let list: string[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ kind: "list", items: list });
      list = [];
    }
  };
  const flushQuote = () => {
    if (quote.length > 0) {
      blocks.push({ kind: "quote", text: quote.join(" ").trim() });
      quote = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      flushAll();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushAll();
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({ kind: "heading", level, text: heading[2] });
      continue;
    }

    if (trimmed.startsWith("> ")) {
      flushParagraph();
      flushList();
      quote.push(trimmed.slice(2));
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      flushQuote();
      list.push(bullet[1]);
      continue;
    }

    // Tabela: linha de cabeçalho seguida de linha separadora.
    if (trimmed.startsWith("|") && lines[i + 1]?.trim().startsWith("|-")) {
      flushAll();
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i].trim()));
        i++;
      }
      i--;
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    // Regra horizontal: separador visual, não gera bloco.
    if (/^-{3,}$/.test(trimmed)) {
      flushAll();
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(trimmed);
  }

  flushAll();
  return blocks;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}
