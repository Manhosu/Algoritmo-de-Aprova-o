import { ExternalLink, FileText } from "lucide-react";

/**
 * UM PDF ABERTO DENTRO DA PÁGINA (pedido da cliente em 08/09/2026).
 *
 * Palavras dela: "ao abrir o material poderia continuar dentro do site, com as
 * barras de cima, do lado e de baixo".
 *
 * Era um link com `target="_blank"`. O aluno saía da plataforma para uma aba do
 * visualizador do navegador: sem menu, sem o botão de marcar como estudado e sem
 * caminho de volta a não ser fechar a aba. No computador, o `<object>` resolve —
 * o navegador desenha o PDF ali mesmo, e as barras continuam em volta.
 *
 * ⚠️ NO CELULAR, NAVEGADOR NENHUM DESENHA PDF EMBUTIDO.
 *
 * Nem o Chrome do Android nem o Safari fazem isso de forma confiável: eles
 * baixam ou abrem no visualizador do sistema. Não existe atributo que mude isso,
 * e fingir que existe entregaria um retângulo vazio de 70% da tela.
 *
 * Então o plano B do próprio `<object>` — o conteúdo filho, que só aparece
 * quando o navegador desiste — é tratado como uma tela de verdade, centrada e
 * explicada, e não como uma mensagem de erro no canto de uma caixa vazia. Quem
 * abrir no celular vê um cartão com o nome do material e um botão; quem abrir no
 * computador vê o PDF.
 *
 * Desenhar o PDF em `<canvas>` com uma biblioteca resolveria os dois casos e é o
 * próximo passo se ela pedir. Fica registrado como escolha, não como esquecimento.
 */
export function PdfViewer({ src, title }: { src: string; title: string }) {
  return (
    <object
      data={src}
      type="application/pdf"
      className="h-[70vh] w-full rounded-xl border border-border bg-card"
      aria-label={`PDF: ${title}`}
    >
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <FileText className="size-10 text-primary" aria-hidden />

        <p className="text-pretty font-medium text-foreground">{title}</p>

        <p className="max-w-xs text-pretty text-sm text-muted-foreground">
          No celular, o PDF abre no visualizador do próprio aparelho. Ao fechar,
          você volta para cá e a página continua onde estava.
        </p>

        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <ExternalLink className="size-4 shrink-0" aria-hidden />
          Abrir o material
        </a>
      </div>
    </object>
  );
}
