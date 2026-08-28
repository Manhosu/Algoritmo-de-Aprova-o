import bruto from "./landing.json";
import { landingSchema, type LandingCopy } from "./landing-schema";

/**
 * A copy da página inicial, validada.
 *
 * DE ONDE VEM ESTE TEXTO
 * ----------------------------------------------------------------------------
 * A cliente edita a copy num repositório SEPARADO, sem acesso ao código. Na
 * hora do build, `scripts/sync-landing-copy.ts` baixa o arquivo de lá, confere
 * contra o schema e sobrescreve `landing.json`.
 *
 * ⚠️ EDITAR `landing.json` AQUI NÃO MUDA O SITE PUBLICADO. Com o repositório de
 * copy conectado, ele vence: a versão daqui é sobrescrita a cada build. O que
 * está commitado neste repositório serve para o desenvolvimento local, onde não
 * há busca de rede, e como último texto conhecido caso a conexão caia.
 *
 * Para mudar o texto do site, mexa no repositório de copy — ou peça à cliente.
 *
 * POR QUE VALIDAR DE NOVO AQUI
 * ----------------------------------------------------------------------------
 * O script já validou o que baixou. Esta segunda passagem cobre o outro
 * caminho: o arquivo commitado, que ninguém baixou e que uma edição local pode
 * ter quebrado. `parse` lança no carregamento do módulo, então o build falha em
 * vez de publicar uma página com um bloco vazio.
 */
export const LANDING: LandingCopy = landingSchema.parse(bruto);
