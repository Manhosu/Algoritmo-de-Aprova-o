import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalDocument } from "@/components/legal/legal-document";
import { getCurrentLegalDocument } from "@/server/legal/documents";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description:
    "As regras de uso da plataforma: conta, limites do plano, acervo e encerramento.",
};

/**
 * Termos de Uso.
 *
 * Espelha a Política de Privacidade de propósito: mesmo `getCurrentLegalDocument`,
 * mesmo `<LegalDocument>`, mesma regra de 404 quando não há versão publicada.
 * Os dois documentos moram em `legal_documents` e `user_consents` aponta para a
 * versão que cada pessoa aceitou — sem isso, "o usuário concordou" seria
 * afirmação sem prova.
 *
 * ⚠️ Esta página existia como LINK antes de existir como PÁGINA. O checkbox do
 * cadastro apontava para cá e dava 404, enquanto o texto do checkbox prometia
 * que a pessoa tinha lido os Termos. Corrigido em 25/08/2026.
 */
export const dynamic = "force-dynamic";

export default async function TermsOfUsePage() {
  const document = await getCurrentLegalDocument("terms");

  // Sem versão publicada, 404 é melhor que uma página em branco: um contrato
  // vazio no ar é pior que contrato nenhum.
  if (!document) notFound();

  return <LegalDocument document={document} />;
}
