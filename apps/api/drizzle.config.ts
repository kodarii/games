import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: resolve(process.cwd(), 'data/apex.db'),
  },
});
