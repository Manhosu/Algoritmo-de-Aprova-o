import { Label } from "@/components/ui/label";

/**
 * Os dois jeitos de mandar uma planilha: escolher o arquivo ou colar o link.
 *
 * ⚠️ O LINK EXISTE POR CAUSA DO CELULAR.
 *
 * Palavras da cliente em 10/09/2026: "estou sem notebook essa semana (...)
 * gostaria que os uploads de planilha funcionassem para planilha no drive". O
 * seletor de arquivos do celular não entrega uma Planilha Google — ela não é
 * arquivo, é documento no servidor deles. O link é o caminho que funciona de
 * qualquer aparelho: o servidor pede ao Google a versão .xlsx.
 *
 * Nenhum dos dois campos é `required`: basta um. Quem decide qual vale é o
 * servidor, em `lerPlanilha`.
 */
const CLASSE =
  "rounded-lg border border-input bg-input px-3 py-2.5 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function SheetSourceFields({ id }: { id: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>Planilha (.xlsx)</Label>
        <input
          id={id}
          name="sheet"
          type="file"
          /*
            ⚠️ SEM `accept`, de propósito. Com `accept=".xlsx"` o seletor filtra
            por extensão, e arquivo escolhido pelo Google Drive chega sem uma.
            Quem valida é o servidor, pelos bytes.
          */
          className={`${CLASSE} file:mr-3 file:rounded-md file:border-0 file:bg-primary/15 file:px-3 file:py-1.5 file:text-sm file:text-primary`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-link`}>ou cole o link da planilha no Google Drive</Label>
        <input
          id={`${id}-link`}
          name="link"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://docs.google.com/spreadsheets/d/…"
          className={`${CLASSE} h-11`}
        />
        <p className="text-xs text-pretty text-muted-foreground">
          No Drive, toque nos três pontinhos da planilha → Compartilhar → Copiar link.
          Ela precisa estar como “Qualquer pessoa com o link”.
        </p>
      </div>
    </div>
  );
}
