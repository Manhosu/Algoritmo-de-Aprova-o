/**
 * Rascunho da Política de Privacidade.
 *
 * ⚠️ ESCRITO POR QUEM CONSTRUIU O SISTEMA, NÃO POR ADVOGADO.
 *
 * O texto está NO AR e descreve com precisão o que a plataforma faz com os
 * dados — essa parte é confiável, porque saiu de quem implementou. O que ele
 * ainda não teve é revisão jurídica.
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
  version: "1.2",
  title: "Política de Privacidade",
  content: `# Política de Privacidade

**Última atualização:** 31 de agosto de 2026

## 1. Quem somos

O Algoritmo da Aprovação é uma plataforma de estudo para concursos públicos.
Esta política explica quais dados pessoais tratamos, para quê, por quanto tempo
e quais são os seus direitos, nos termos da Lei nº 13.709/2018 (LGPD).

**Controlador dos dados:** O Algoritmo da Aprovação.
**Contato do controlador e do encarregado:** oalgoritmodaaprovacao@gmail.com

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

### 3.1 O que outros alunos veem sobre você

O Ranking mostra **seu primeiro nome** ao lado da sua posição, do seu XP, do seu
nível e da sua sequência de dias. Ele fica visível para os outros alunos da
plataforma.

Seu sobrenome, e-mail, WhatsApp e desempenho por disciplina **não** aparecem
para ninguém além de você e da nossa equipe.

Se você preferir não ter o nome exibido, desligue a opção "Aparecer com meu nome
no Ranking" nas Configurações. Sua posição continua contando; no lugar do nome,
os outros alunos veem "Aluno".

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

Dúvidas ou exercício de direitos: oalgoritmodaaprovacao@gmail.com.
Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
`,
} as const;

/**
 * Rascunho dos Termos de Uso.
 *
 * ⚠️ ESCRITO POR QUEM CONSTRUIU O SISTEMA, NÃO POR ADVOGADO.
 *
 * O texto está NO AR e descreve com precisão o que a plataforma faz com os
 * dados — essa parte é confiável, porque saiu de quem implementou. O que ele
 * ainda não teve é revisão jurídica.
 *
 * Nasceu de um defeito encontrado em 25/08/2026: o checkbox do cadastro diz
 * "Li e aceito a Política de Privacidade **e os Termos de Uso**", mas os Termos
 * não existiam — o link dava 404 — e `registerUser` só gravava consentimento de
 * `privacy`. A interface prometia dois documentos, o sistema guardava um, e o
 * outro não estava publicado em lugar nenhum.
 *
 * Como a Política, entra com `isCurrent = false`: rascunho não vira contrato
 * por acidente.
 *
 * Três pontos aqui descrevem decisões REAIS de arquitetura, e é por isso que
 * este texto não é genérico:
 *
 *   1. o limite diário de questões por plano existe e é aplicado no servidor;
 *   2. o conteúdo do edital é lido por IA e pode conter erro — quem confirma é
 *      o aluno, e isso muda de quem é a responsabilidade pelo plano de estudo;
 *   3. o Índice de Preparação NÃO é previsão de aprovação, e o texto precisa
 *      dizer isso com todas as letras.
 */
export const TERMS_OF_USE_DRAFT = {
  version: "1.1",
  title: "Termos de Uso",
  content: `# Termos de Uso

**Última atualização:** 31 de agosto de 2026

## 1. O que é esta plataforma

O Algoritmo da Aprovação é uma plataforma de estudo para concursos públicos.
A partir do edital que você envia, ela organiza o conteúdo programático,
prioriza o que estudar a cada dia, agenda revisões e acompanha seu desempenho.

**Fornecedor:** O Algoritmo da Aprovação.
**Contato:** oalgoritmodaaprovacao@gmail.com

Ao criar uma conta, você concorda com estes Termos e com a Política de
Privacidade.

## 2. Quem pode usar

É preciso ter 18 anos ou mais, ou autorização de responsável legal. A conta é
pessoal e intransferível: você é responsável por manter sua senha em sigilo e
por tudo que acontecer na sua conta.

Se suspeitar de acesso indevido, troque a senha em Configurações. Isso encerra
as sessões abertas nos outros aparelhos imediatamente.

## 3. O que você pode esperar da plataforma

### 3.1 Leitura do edital

O conteúdo programático é extraído do PDF por inteligência artificial. **A
leitura pode conter erros ou omissões.** Por isso existe a tela de conferência:
você revisa, corrige, apaga e acrescenta itens antes de confirmar.

A partir da sua confirmação, o plano de estudo é montado sobre a lista que
**você** aprovou. Conferir é parte do processo, não uma formalidade.

### 3.2 O que o algoritmo faz e o que ele não faz

A plataforma prioriza assuntos, sugere técnicas de estudo, agenda revisões e
mede seu desempenho. Ela **não garante aprovação em concurso algum**.

O **Índice de Preparação** mede o quanto você avançou no seu próprio plano de
estudo. Ele **não é** probabilidade de aprovação, nota esperada nem previsão de
resultado. Nenhum número exibido na plataforma deve ser lido assim.

### 3.3 Disponibilidade

Fazemos o possível para manter tudo no ar, mas o serviço pode ficar
indisponível por manutenção, falha técnica ou interrupção de terceiros. Não há
garantia de disponibilidade ininterrupta.

## 4. Planos e limites

Há um plano gratuito e planos pagos. Cada plano define limites — entre eles a
**quantidade de questões por dia** e o **número de preparações ativas
simultâneas**. Os limites vigentes ficam visíveis na página de planos.

Atingir o limite diário de questões não bloqueia o restante da plataforma: o
conteúdo já respondido, as revisões e o cronograma continuam acessíveis.

Se você mudar para um plano com menos preparações do que já possui, **nada é
apagado**. As preparações excedentes ficam somente leitura, e você escolhe qual
continua ativa. Ao voltar para o plano maior, todas voltam a funcionar.

## 5. Conteúdo

### 5.1 Nosso

Questões, comentários, materiais de estudo, o código e a marca pertencem ao
fornecedor. Você recebe uma licença pessoal e intransferível para usá-los
enquanto sua conta estiver ativa.

**Não é permitido** copiar, redistribuir, revender, publicar ou usar o acervo
para treinar outros sistemas.

### 5.2 Seu

O PDF do edital que você envia continua seu. Nós o usamos para montar o seu
plano de estudo e o guardamos enquanto sua preparação existir.

Não envie documento que contenha dado pessoal de terceiros nem material sobre o
qual você não tenha direito de uso.

## 6. Uso aceitável

Não é permitido:

- compartilhar sua conta ou vender acesso a ela;
- extrair o acervo de forma automatizada (raspagem, robôs, scripts);
- tentar burlar limites de plano, contornar autenticação ou acessar dados de
  outras pessoas;
- interferir no funcionamento da plataforma ou na experiência de outros alunos.

Detectado o descumprimento, a conta pode ser suspensa. Em caso grave ou
reincidente, encerrada.

## 7. Pagamentos

Os planos pagos são cobrados pelo meio de pagamento indicado no momento da
contratação. A assinatura se renova automaticamente até que você a cancele.

Cancelar interrompe as cobranças seguintes; o acesso continua até o fim do
período já pago. Você tem direito de arrependimento em até 7 dias da
contratação, nos termos do art. 49 do Código de Defesa do Consumidor.

Registros de pagamento são retidos pelo prazo legal mesmo após a exclusão da
conta — é obrigação fiscal, e está explicado na Política de Privacidade.

## 8. Encerrar sua conta

Você pode pedir a exclusão a qualquer momento, em Configurações.

A exclusão acontece **7 dias** depois do pedido. Nesse intervalo, basta entrar
na plataforma para cancelá-la — o simples acesso já interrompe o processo.

Depois disso, seus dados pessoais são removidos de forma irreversível. O que
resta do seu histórico deixa de ser atribuível a você e permanece apenas como
número em estatísticas agregadas. Os detalhes estão na Política de Privacidade.

## 9. Mudanças nestes Termos

Podemos alterar estes Termos. Toda versão publicada fica registrada, e o aceite
de cada pessoa aponta para a versão que estava vigente quando ela aceitou.

Mudanças relevantes serão comunicadas por e-mail ou dentro da plataforma antes
de passarem a valer.

## 10. Limitação de responsabilidade

A plataforma é uma ferramenta de organização e acompanhamento de estudo. O
fornecedor não responde por resultado em concurso, por decisão de banca
organizadora, por alteração de edital ou por conteúdo de terceiros indicado no
edital.

Nada aqui afasta direitos que o Código de Defesa do Consumidor garante a você.

## 11. Lei aplicável e foro

Estes Termos são regidos pela lei brasileira. Fica eleito o foro do domicílio
do consumidor para dirimir controvérsias.

---

Dúvidas sobre estes Termos: oalgoritmodaaprovacao@gmail.com.
`,
} as const;
