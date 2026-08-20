-- ============================================================================
-- IMUTABILIDADE DA CONFIGURAÇÃO DOS MOTORES
-- ============================================================================
--
-- Requisito do Eduardo (decisão 14): "configuração de pesos e de XP é versionada
-- e imutável após uso, e cada tarefa gerada grava qual versão a produziu."
--
-- A trava existir só na camada de repositório não basta: um UPDATE manual pelo
-- Supabase Studio, um script de correção ou um bug futuro reescreveriam o
-- passado sem deixar rastro — e aí "por que o algoritmo mudou de comportamento
-- na terça?" volta a não ter resposta.
--
-- Este gatilho move a garantia para o banco. Depois que uma versão é USADA
-- (`locked_at` preenchido no primeiro uso por qualquer motor), o conteúdo dela
-- não muda mais. Quem quiser alterar cria a versão seguinte.
--
-- O que CONTINUA permitido numa linha travada, porque é ciclo de vida e não
-- conteúdo: ativar/desativar (`is_active`), aposentar (`retired_at`) e o
-- carimbo automático de `updated_at`.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_engine_config_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Linha ainda não usada por nenhum motor: pode ser editada à vontade.
  IF OLD.locked_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.change_note IS DISTINCT FROM OLD.change_note
     OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
     OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'engine_configs %/v% ja foi usada em % e e imutavel. Crie a versao seguinte em vez de alterar esta.',
      OLD.kind, OLD.version, OLD.locked_at
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_engine_configs_immutable ON engine_configs;
--> statement-breakpoint

CREATE TRIGGER trg_engine_configs_immutable
  BEFORE UPDATE ON engine_configs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_engine_config_immutability();
--> statement-breakpoint

-- ============================================================================
-- Uma versão travada também não pode ser APAGADA.
--
-- As chaves estrangeiras já protegem o caso comum (`daily_tasks.engine_config_id`
-- é ON DELETE RESTRICT), mas uma versão pode estar travada sem ter gerado tarefa
-- ainda — por exemplo se só produziu lançamentos de XP. Este gatilho fecha a
-- brecha de forma uniforme.
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_locked_engine_config_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION
      'engine_configs %/v% ja foi usada e nao pode ser apagada: o historico depende dela para ser explicavel.',
      OLD.kind, OLD.version
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_engine_configs_no_delete ON engine_configs;
--> statement-breakpoint

CREATE TRIGGER trg_engine_configs_no_delete
  BEFORE DELETE ON engine_configs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_engine_config_delete();
