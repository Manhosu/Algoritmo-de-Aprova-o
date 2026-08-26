import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalDocument } from "@/components/legal/legal-document";
import { getCurrentLegalDocument } from "@/server/legal/documents";
import { socialMetadata } from "@/lib/metadata";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description:
    "Como tratamos seus dados pessoais, por quanto tempo e quais são os seus direitos.",
  ...socialMetadata({ title: "Política de Privacidade", path: "/politica-de-privacidade" }),
};

/**
 * Política de Privacidade (README 1.1).
 *
 * O conteúdo vem do BANCO, não de um arquivo — `legal_documents` guarda as
 * versões e `user_consents` aponta para a que cada pessoa aceitou. Sem isso,
 * "o usuário consentiu" seria afirmação sem prova: não haveria como dizer com
 * o quê ele consentiu depois de o texto mudar.
 *
 * A página é dinâmica de propósito. Publicar uma versão nova pelo painel
 * precisa refletir aqui na hora, e não no próximo deploy.
 */
export const dynamic = "force-dynamic";

export default async function PrivacyPolicyPage() {
  const document = await getCurrentLegalDocument("privacy");

  // Sem versão publicada, é melhor 404 do que uma página em branco: uma
  // política vazia no ar é pior que política nenhuma.
  if (!document) notFound();

  return <LegalDocument document={document} />;
}
