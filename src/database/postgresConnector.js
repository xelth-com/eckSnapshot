import knex from 'knex';
import fs from 'fs/promises';
import path from 'path';
import config from '../../knexfile.js';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let knexInstance = null;

function getKnex() {
  if (!knexInstance) {
    console.log('Initializing Knex connection...');
    knexInstance = knex(config.development);
  }
  return knexInstance;
}

async function initDb() {
  const db = getKnex();
  try {
    console.log('Checking database connection...');
    await db.raw('SELECT 1+1 AS result');
    console.log('Connection successful.');

    console.log('Applying database schema...');
    // Try full schema first, fallback to simple schema
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schemaSQL = await fs.readFile(schemaPath, 'utf-8');
      await db.raw(schemaSQL);
      console.log('Full schema with vector extensions applied successfully.');
    } catch (error) {
      console.log('Vector extensions not available, using simplified schema...');
      const simpleSchemaPath = path.join(__dirname, 'schema_simple.sql');
      const simpleSchemaSQL = await fs.readFile(simpleSchemaPath, 'utf-8');
      await db.raw(simpleSchemaSQL);
      console.log('Simplified schema applied successfully.');
    }
  } catch (error) {
    console.error('Error initializing database:', error.message);
    throw error;
  }
}

async function destroyDb() {
  if (knexInstance) {
    console.log('Destroying Knex connection pool...');
    await knexInstance.destroy();
    knexInstance = null;
  }
}

export {
  getKnex,
  initDb,
  destroyDb,
};