-- One-time setup for a fresh `balancevault` database.
-- Run with psql as a database owner/administrator. Do not commit the entered passwords.
\prompt 'Password for balancevault_migrator: ' bv_migrator_password
\prompt 'Password for balancevault_app: ' bv_app_password

CREATE ROLE balancevault_migrator LOGIN PASSWORD :'bv_migrator_password';
CREATE ROLE balancevault_app LOGIN PASSWORD :'bv_app_password';

GRANT CONNECT ON DATABASE balancevault TO balancevault_migrator, balancevault_app;
\connect balancevault

GRANT USAGE, CREATE ON SCHEMA public TO balancevault_migrator;
GRANT USAGE ON SCHEMA public TO balancevault_app;

-- Grants access to any objects already created in the schema.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO balancevault_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO balancevault_app;

-- Grants app access to tables and sequences created by future migrations run as the migrator.
ALTER DEFAULT PRIVILEGES FOR ROLE balancevault_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO balancevault_app;
ALTER DEFAULT PRIVILEGES FOR ROLE balancevault_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO balancevault_app;
