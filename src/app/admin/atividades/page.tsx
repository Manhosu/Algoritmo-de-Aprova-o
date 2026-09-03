import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/server/auth/guards";
import { listActivity, type ActivityArea } from "@/server/admin/activity-log";
import { listStudentsDetailed } from "@/server/admin/student-detail";
import { loadCatalog } from "@/server/taxonomy/mapping";

export const metadata: Metadata = { title: "Atividades" };

export const dynamic = "force-dynamic";

const ROTULO_AREA: Record<ActivityArea, string> = {
  questoes: "Questões",
  estudos: "Estudos",
  revisoes: "Revisões",
  loja: "Loja",
  conquistas: "Conquistas",
  preparacao: "Preparação",
};

const CLASSE_CAMPO =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm [&>option]:bg-card [&>option]:text-foreground";

/**
 * HISTÓRICO DE ATIVIDADES DOS ALUNOS (pedido da cliente em 02/09/2026).
 *
 * ⚠️ ESTA TELA MOSTRA O QUE CADA ALUNO FEZ, com nome e e-mail ao lado.
 *
 * É dado pessoal de terceiros, e o que a cerca é `requireAdmin` na primeira
 * linha. Nada daqui aparece em nenhuma tela de aluno.
 */
export default async function AtividadesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const um = (chave: string) => {
    const valor = params[chave];
    const texto = Array.isArray(valor) ? valor[0] : valor;
    return texto?.trim() || null;
  };

  const pagina = Number(um("pagina") ?? "0") || 0;
  const areaFiltro = um("area");

  const [alunos, catalogo, resultado] = await Promise.all([
    listStudentsDetailed(),
    loadCatalog(),
    listActivity({
      page: pagina,
      filters: {
        userId: um("aluno"),
        area: (areaFiltro && areaFiltro in ROTULO_AREA
          ? areaFiltro
          : null) as ActivityArea | null,
        canonicalSubjectId: um("disciplina"),
        from: um("de"),
        to: um("ate"),
      },
    }),
  ]);

  const formatador = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-eyebrow">Administração</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Atividades</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Tudo o que os alunos fizeram, do mais recente para o mais antigo.
        </p>
      </header>

      {/* Formulário GET: o estado do filtro é a URL, e sobrevive ao F5. */}
      <form
        method="get"
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Aluno</span>
          <select name="aluno" defaultValue={um("aluno") ?? ""} className={CLASSE_CAMPO}>
            <option value="">Todos</option>
            {alunos.map((aluno) => (
              <option key={aluno.id} value={aluno.id}>
                {aluno.name ?? aluno.email ?? aluno.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Área</span>
          <select name="area" defaultValue={areaFiltro ?? ""} className={CLASSE_CAMPO}>
            <option value="">Todas</option>
            {Object.entries(ROTULO_AREA).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Disciplina</span>
          <select
            name="disciplina"
            defaultValue={um("disciplina") ?? ""}
            className={CLASSE_CAMPO}
          >
            <option value="">Todas</option>
            {catalogo.subjects.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">De</span>
          <input type="date" name="de" defaultValue={um("de") ?? ""} className={CLASSE_CAMPO} />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Até</span>
          <input type="date" name="ate" defaultValue={um("ate") ?? ""} className={CLASSE_CAMPO} />
        </label>

        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-5">
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Filtrar
          </button>
          <Link
            href="/admin/atividades"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Limpar
          </Link>
        </div>
      </form>

      {resultado.rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Nenhuma atividade com esses filtros.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Quando</th>
                <th scope="col" className="px-4 py-3 font-medium">Aluno</th>
                <th scope="col" className="px-4 py-3 font-medium">Área</th>
                <th scope="col" className="px-4 py-3 font-medium">Ação</th>
                <th scope="col" className="px-4 py-3 font-medium">Disciplina</th>
                <th scope="col" className="px-4 py-3 font-medium">Conteúdo</th>
                <th scope="col" className="px-4 py-3 font-medium">Detalhe</th>
              </tr>
            </thead>

            <tbody>
              {resultado.rows.map((linha, indice) => (
                /*
                  A chave é o índice porque a união não tem id próprio: duas
                  linhas podem coincidir em instante, aluno e ação (duas questões
                  respondidas no mesmo segundo). A lista é somente leitura e
                  recarrega inteira, então o índice não causa reaproveitamento
                  errado de estado.
                */
                <tr key={indice} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {formatador.format(linha.occurredAt)}
                  </td>
                  <td className="max-w-[12rem] px-4 py-3">
                    <span className="block truncate text-foreground">
                      {linha.userName ?? "Conta anonimizada"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {linha.userEmail ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {ROTULO_AREA[linha.area] ?? linha.area}
                  </td>
                  <td className="px-4 py-3 text-foreground">{linha.action}</td>
                  <td className="max-w-[10rem] px-4 py-3">
                    <span className="block truncate text-muted-foreground">
                      {linha.subjectName ?? "—"}
                    </span>
                  </td>
                  <td className="max-w-[14rem] px-4 py-3">
                    <span className="block truncate text-muted-foreground">
                      {linha.topicName ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {linha.detail ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Paginação">
        <PaginaLink params={params} pagina={pagina - 1} desabilitado={pagina === 0}>
          Anterior
        </PaginaLink>
        <span className="text-muted-foreground">Página {pagina + 1}</span>
        <PaginaLink params={params} pagina={pagina + 1} desabilitado={!resultado.hasMore}>
          Próxima
        </PaginaLink>
      </nav>
    </div>
  );
}

function PaginaLink({
  params,
  pagina,
  desabilitado,
  children,
}: {
  params: Record<string, string | string[] | undefined>;
  pagina: number;
  desabilitado: boolean;
  children: React.ReactNode;
}) {
  if (desabilitado) {
    return <span className="rounded-lg border border-border px-3 py-2 opacity-40">{children}</span>;
  }

  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    const texto = Array.isArray(valor) ? valor[0] : valor;
    if (texto && chave !== "pagina") busca.set(chave, texto);
  }
  busca.set("pagina", String(pagina));

  return (
    <Link
      href={`/admin/atividades?${busca}`}
      className="rounded-lg border border-border px-3 py-2 font-medium text-foreground hover:border-primary/50"
    >
      {children}
    </Link>
  );
}
