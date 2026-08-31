import { FileUp, ListChecks, Loader2, Plus, Target } from "lucide-react";
import Link from "next/link";

import { EmptyState, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import type { NextStep, NextStepIcon } from "@/modules/onboarding/next-step";

const ICONES: Record<NextStepIcon, React.ReactNode> = {
  create: <Plus />,
  upload: <FileUp />,
  review: <ListChecks />,
  diagnosis: <Target />,
  processing: <Loader2 className="animate-spin" />,
};

/**
 * O que mostrar numa tela que depende do plano, quando o plano ainda não existe.
 *
 * ⚠️ MANDA DIRETO PARA O PASSO QUE FALTA, e é essa a diferença que importa. A
 * versão anterior dizia "seu cronograma aparece quando a preparação estiver
 * pronta" e oferecia um botão de volta para a Home: dois cliques para descobrir
 * que faltava subir um PDF. A cliente leu como link quebrado, e ela estava
 * certa em espírito — a tela não respondia "e agora?".
 */
export function PendingStep({ step }: { step: NextStep }) {
  return (
    <Surface>
      <EmptyState
        icon={ICONES[step.icon]}
        title={step.title}
        description={step.body}
        action={
          step.cta ? (
            <div className="mt-2 flex flex-col items-center gap-2">
              <Button asChild>
                <Link href={step.href}>{step.cta}</Link>
              </Button>

              {step.alternative ? (
                <Link
                  href={step.alternative.href}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  {step.alternative.label}
                </Link>
              ) : null}
            </div>
          ) : undefined
        }
      />
    </Surface>
  );
}
