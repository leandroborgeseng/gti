-- Criticidade «Não se aplica» (ticket 94): item visível, excluído do cálculo de cumprimento.
ALTER TYPE "ContractItemCriticality" ADD VALUE IF NOT EXISTS 'NAO_SE_APLICA';
