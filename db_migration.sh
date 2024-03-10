#!/bin/sh

# Run Drizzle migrations
npx drizzle-kit generate:mysql
echo "Migrations applied successfully."

# Continue with the main process
exec "$@"