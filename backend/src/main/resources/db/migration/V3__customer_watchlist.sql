-- Backfill existing screened customers without changing independent watchlist records.
INSERT INTO watchlist_records (id, record_data, sort_order)
SELECT CONCAT('customer-', c.id), JSON_OBJECT('id', CONCAT('customer-', c.id), 'customerId', c.id, 'name', JSON_UNQUOTE(JSON_EXTRACT(c.record_data, '$.name')), 'country', JSON_UNQUOTE(JSON_EXTRACT(c.record_data, '$.country')), 'dob', JSON_UNQUOTE(JSON_EXTRACT(c.record_data, '$.dob')), 'source', 'Customer screening'), c.sort_order + COALESCE((SELECT MAX(w.sort_order) FROM watchlist_records w), 0) + 1
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM watchlist_records w WHERE JSON_UNQUOTE(JSON_EXTRACT(w.record_data, '$.customerId')) = c.id);
UPDATE workspace SET revision = revision + 1 WHERE id = 1;
INSERT INTO audit_events(actor, action, subject) VALUES ('system', 'CUSTOMER_WATCHLIST_BACKFILLED', 'Existing customer records');
