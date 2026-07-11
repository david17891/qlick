SELECT slug, title, price_mxn, status, is_published
FROM courses
WHERE status = 'active' AND is_published = true
ORDER BY price_mxn DESC
LIMIT 5;
