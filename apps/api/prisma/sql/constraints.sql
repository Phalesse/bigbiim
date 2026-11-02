-- BIGBIIM : règles d'intégrité appliquées en base (section 4.7 du document).
-- Script idempotent : il est rejoué à chaque démarrage, juste après `prisma db push`
-- (qui supprime les index inconnus du schéma Prisma, d'où ce rejeu).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index spécifiques : réponses du projet (GIN sur JSONB) et recherche textuelle de prestataires
CREATE INDEX IF NOT EXISTS idx_project_answers_gin ON "Project" USING GIN ("answers" jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_provider_legalname_trgm ON "Provider" USING GIN ("legalName" gin_trgm_ops);

-- Un seul devis verrouillé actif par projet
CREATE UNIQUE INDEX IF NOT EXISTS uq_quote_locked_per_project ON "Quote" ("projectId") WHERE "locked" = true;

-- Numérotation continue des factures (utilisez nextval('invoice_number_seq'))
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;

-- Tables immuables : grand livre et journal d'audit
CREATE OR REPLACE FUNCTION bigbiim_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La table % est immuable (opération % interdite)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_entry_immutable ON "LedgerEntry";
CREATE TRIGGER trg_ledger_entry_immutable BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION bigbiim_forbid_change();

DROP TRIGGER IF EXISTS trg_ledger_transaction_immutable ON "LedgerTransaction";
CREATE TRIGGER trg_ledger_transaction_immutable BEFORE UPDATE OR DELETE ON "LedgerTransaction"
  FOR EACH ROW EXECUTE FUNCTION bigbiim_forbid_change();

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON "AuditLog";
CREATE TRIGGER trg_audit_log_immutable BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION bigbiim_forbid_change();

-- Grand livre : somme des débits = somme des crédits par transaction (contrôle en fin de transaction SQL)
-- Valeurs attendues de "direction" : DEBIT / CREDIT (sans distinction de casse).
CREATE OR REPLACE FUNCTION bigbiim_ledger_check_balance() RETURNS trigger AS $$
DECLARE
  total_debit numeric;
  total_credit numeric;
BEGIN
  SELECT COALESCE(SUM("amount") FILTER (WHERE UPPER("direction") = 'DEBIT'), 0),
         COALESCE(SUM("amount") FILTER (WHERE UPPER("direction") = 'CREDIT'), 0)
    INTO total_debit, total_credit
    FROM "LedgerEntry" WHERE "transactionId" = NEW."transactionId";
  IF total_debit <> total_credit THEN
    RAISE EXCEPTION 'Transaction % déséquilibrée : débit % / crédit %', NEW."transactionId", total_debit, total_credit;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_balance ON "LedgerEntry";
CREATE CONSTRAINT TRIGGER trg_ledger_balance AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bigbiim_ledger_check_balance();

-- Version d'activité publiée : immuable. Valeur de statut attendue : PUBLIE (BROUILLON / PUBLIE / RETIRE).
CREATE OR REPLACE FUNCTION bigbiim_activity_version_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'PUBLIE' THEN
      RAISE EXCEPTION 'Une version publiée ne peut pas être supprimée';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'PUBLIE' AND (
       NEW."definition" IS DISTINCT FROM OLD."definition"
    OR NEW."activityId" IS DISTINCT FROM OLD."activityId"
    OR NEW."version" IS DISTINCT FROM OLD."version") THEN
    RAISE EXCEPTION 'Une version publiée est immuable : créez la version suivante';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activity_version_guard ON "ActivityVersion";
CREATE TRIGGER trg_activity_version_guard BEFORE UPDATE OR DELETE ON "ActivityVersion"
  FOR EACH ROW EXECUTE FUNCTION bigbiim_activity_version_guard();

-- Project.activityVersionId n'est plus modifiable après la confirmation
CREATE OR REPLACE FUNCTION bigbiim_project_version_guard() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('CONFIRME', 'EN_COURS', 'EN_LITIGE', 'TERMINE', 'CLOTURE')
     AND NEW."activityVersionId" IS DISTINCT FROM OLD."activityVersionId" THEN
    RAISE EXCEPTION 'La version d''activité d''un projet confirmé ne peut plus changer';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_version_guard ON "Project";
CREATE TRIGGER trg_project_version_guard BEFORE UPDATE ON "Project"
  FOR EACH ROW EXECUTE FUNCTION bigbiim_project_version_guard();
