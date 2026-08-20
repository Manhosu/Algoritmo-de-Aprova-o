/**
 * Rascunho da Política de Privacidade.
 *
 * ⚠️ ISTO É UM RASCUNHO TÉCNICO, NÃO UM PARECER JURÍDICO.
 *
 * Foi escrito para descrever com precisão o que o sistema REALMENTE faz com os
 * dados — inclusive as duas coisas que costumam ficar de fora e que aqui são
 * decisões conscientes de arquitetura:
 *
 *   1. a exclusão de conta preserva eventos anonimizados para métrica agregada;
 *   2. registros de pagamento são retidos por obrigação legal e, portanto,
 *      "apagar tudo" não é literalmente verdade.
 *
 * Prometer exclusão total e não entregar é pior do que explicar a exceção.
 *
 * O seed insere este texto com `isCurrent = false`, ou seja, ele NÃO é
 * publicado. Só vira a versão corrente depois de revisão por advogado.
 */

export const PRIVACY_POLICY_DRAFT = {
  version: "0.1-rascunho",
  title: "Política de Privacidade",
  content: `# Política de Privacidade

> **RASCUNHO — pendente de revisão jurídica.** Este texto descreve com precisão
> o funcionamento técnico da plataforma, mas ainda não foi validado por
> advogado e não está publicado.

**Última atualização:** [preencher na publicação]

## 1. Quem somos

O Algoritmo da Aprovação é uma plataforma de estudo para concursos públicos.
Esta política explica quais dados pessoais tratamos, para quê, por quanto tempo
e quais são os seus direitos, nos termos da Lei nº 13.709/2018 (LGPD).

**Controlador dos dados:** [razão social, CNPJ e endereço]
**Encarregado (DPO):** [nome e e-mail de contato]

## 2. Quais dados coletamos

### 2.1 Dados que você nos fornece

| Dado | Finalidade | Base legal |
|---|---|---|
| Nome | Identificar você na plataforma e personalizar a interface | Execução de contrato |
| E-mail | Autenticação, recuperação de senha e comunicações sobre o serviço | Execução de contrato |
| WhatsApp | Contato e suporte | Execução de contrato |
| Senha | Autenticação (armazenada apenas como *hash* com argon2id — nunca em texto legível) | Execução de contrato |
| Edital em PDF que você envia | Extrair o conteúdo programático e montar o seu plano de estudo | Execução de contrato |
| Diagnóstico de domínio | Calibrar a priorização inicial dos assuntos | Execução de contrato |
| Disponibilidade de estudo | Dimensionar a tarefa diária ao tempo que você tem | Execução de contrato |

### 2.2 Dados gerados pelo seu uso

| Dado | Finalidade |
|---|---|
| Respostas às questões, com data e hora | Medir desempenho, identificar lacunas e alimentar os algoritmos de priorização e revisão |
| Conteúdos marcados como estudados | Agendar as revisões espaçadas |
| Tempo de permanência na plataforma | Compor a métrica "Horas Estudadas" |
| Eventos de navegação | Entender onde o produto trava e melhorá-lo |
| Endereço IP e navegador | Segurança da conta (guardados apenas como *hash*, não em forma legível) |

### 2.3 O que NÃO coletamos

Não coletamos dados sensíveis (origem racial, convicção religiosa, opinião
política, filiação sindical, saúde, vida sexual, dados genéticos ou
biométricos). Não pedimos CPF, RG nem dados bancários — pagamentos são
processados pelo Mercado Pago e os dados do cartão não passam pelos nossos
servidores.

## 3. Com quem compartilhamos

Compartilhamos o mínimo necessário, com fornecedores que atuam como operadores:

| Fornecedor | O que recebe | Para quê |
|---|---|---|
| Supabase | Banco de dados | Hospedar seus dados |
| Anthropic | O conteúdo do edital que você envia | Extrair disciplinas e assuntos |
| Resend | Seu e-mail e o conteúdo da mensagem | Enviar e-mails de recuperação de senha e confirmação |
| Mercado Pago | Dados de cobrança | Processar assinaturas |

Não vendemos seus dados. Não os compartilhamos para publicidade de terceiros.

## 4. Por quanto tempo guardamos

Enquanto sua conta existir. Depois do pedido de exclusão, aplicam-se as regras
da seção 6.

## 5. Seus direitos

Você pode, a qualquer momento: confirmar que tratamos seus dados; acessá-los;
corrigi-los; solicitar a exclusão; solicitar a portabilidade (exportação em
formato legível); revogar consentimentos; e obter informação sobre com quem
compartilhamos.

Os pedidos de acesso, exportação e exclusão podem ser feitos diretamente nas
Configurações da sua conta.

## 6. Exclusão da conta — o que acontece exatamente

Queremos ser específicos aqui, porque "apagamos tudo" costuma ser impreciso.

**Apagamos definitivamente:** seu nome, e-mail, WhatsApp e senha; seus editais
enviados e os arquivos PDF; suas preparações, diagnósticos e cronogramas; suas
respostas a questões; seus registros de estudo e de tempo de uso; seu XP,
moedas, conquistas e sequências; suas sessões de acesso.

**Mantemos, sem qualquer vínculo com você:** contagens agregadas de uso da
plataforma. Para que esses números históricos não mudem retroativamente,
substituímos seu identificador por uma chave pseudônima gerada por função
criptográfica de mão única, cuja semente é guardada fora do banco de dados.
Depois da exclusão, **nenhum registro do sistema associa essa chave a uma
pessoa** — o vínculo é destruído, não apenas ocultado. O resultado é um dado
anonimizado, que segundo o art. 5º, XI, da LGPD deixa de ser dado pessoal.

**Mantemos, por obrigação legal:** registros de pagamento e faturamento, pelo
prazo exigido pela legislação fiscal, com base no art. 16, II, da LGPD. Deles
removemos os dados pessoais que não forem exigidos por lei.

**Mantemos, como prova de conformidade:** o registro de que você consentiu, com
data e versão do documento aceito, e o registro do próprio pedido de exclusão —
sem os dados de navegação associados.

## 7. Segurança

Senhas são armazenadas com argon2id. As sessões usam token aleatório guardado
apenas como *hash*, com expiração e possibilidade de revogação imediata. Todo o
tráfego é criptografado. O acesso administrativo é restrito e auditado. Fazemos
backup diário do banco de dados.

Nenhum sistema é imune a incidentes. Se ocorrer um incidente de segurança com
risco relevante a você, comunicaremos você e a ANPD nos prazos da lei.

## 8. Cookies

Usamos apenas o cookie estritamente necessário para manter você autenticado. Não
usamos cookies de publicidade nem de rastreamento de terceiros.

## 9. Menores de idade

A plataforma é destinada a maiores de 18 anos. Não coletamos intencionalmente
dados de menores.

## 10. Alterações

Se esta política mudar, publicaremos a nova versão e avisaremos você. As versões
anteriores ficam registradas, e o registro do seu consentimento indica qual
versão você aceitou.

## 11. Contato

Dúvidas ou exercício de direitos: [e-mail do encarregado].
Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
`,
} as const;
