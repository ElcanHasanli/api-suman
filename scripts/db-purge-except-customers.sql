-- Bir Inci Su müştərilərini saxla; qalan biznes məlumatını sil.
-- Serverdə: sudo -u postgres psql -d api_suman -f /root/api-suman/scripts/db-purge-except-customers.sql

BEGIN;

DO $$
DECLARE
  keep_id INT;
  keep_name TEXT;
BEGIN
  SELECT id, name INTO keep_id, keep_name
  FROM companies
  WHERE name ILIKE '%inci%su%'
  ORDER BY id
  LIMIT 1;

  IF keep_id IS NULL THEN
    RAISE EXCEPTION 'Company "Bir Inci Su" not found';
  END IF;

  RAISE NOTICE 'Keeping company id=% name=%', keep_id, keep_name;

  DELETE FROM notifications n
  WHERE n.order_id IN (SELECT id FROM orders WHERE company_id = keep_id)
     OR n.user_id IN (SELECT id FROM users WHERE company_id = keep_id);

  DELETE FROM order_notes WHERE company_id = keep_id;
  DELETE FROM orders WHERE company_id = keep_id;
  DELETE FROM debt_payments WHERE company_id = keep_id;
  DELETE FROM customer_inactivity_alerts WHERE company_id = keep_id;
  DELETE FROM expenses WHERE company_id = keep_id;
  DELETE FROM warehouse_updates WHERE company_id = keep_id;
  DELETE FROM warehouse_stock WHERE company_id = keep_id;

  DELETE FROM companies WHERE id <> keep_id;

  RAISE NOTICE 'Done. Customers kept for company id=%', keep_id;
END $$;

COMMIT;

-- Yoxlama
SELECT c.id, c.name,
  (SELECT COUNT(*) FROM customers cu WHERE cu.company_id = c.id) AS customers,
  (SELECT COUNT(*) FROM orders o WHERE o.company_id = c.id) AS orders
FROM companies c;
