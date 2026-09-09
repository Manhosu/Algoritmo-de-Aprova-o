CREATE TABLE "question_topics" (
	"question_id" uuid NOT NULL,
	"canonical_topic_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_topics_question_id_canonical_topic_id_pk" PRIMARY KEY("question_id","canonical_topic_id")
);
--> statement-breakpoint
ALTER TABLE "question_topics" ADD CONSTRAINT "question_topics_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_topics" ADD CONSTRAINT "question_topics_canonical_topic_id_canonical_topics_id_fk" FOREIGN KEY ("canonical_topic_id") REFERENCES "public"."canonical_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_topics_topic_idx" ON "question_topics" USING btree ("canonical_topic_id");--> statement-breakpoint
-- ⚠️ AS 1.046 QUESTÕES QUE JÁ ESTÃO NO ACERVO PRECISAM ENTRAR AQUI.
--
-- A busca por assunto, o filtro do painel e a contagem do motor passaram a ler
-- esta tabela. Sem esta linha, a migration apagaria o acervo inteiro da vista
-- da cliente no instante em que subisse: as questões continuariam no banco, o
-- filtro de assunto devolveria zero, e o motor concluiria que não há questão
-- nenhuma para mandar o aluno resolver.
INSERT INTO "question_topics" ("question_id", "canonical_topic_id", "is_primary")
SELECT "id", "canonical_topic_id", true
FROM "questions"
WHERE "canonical_topic_id" IS NOT NULL
ON CONFLICT DO NOTHING;