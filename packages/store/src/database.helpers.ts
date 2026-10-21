import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { coreMigrations, type Migration, runMigrations } from './migrations.helpers.js'

export type StoreDatabase = Database.Database

export function openDatabase(
  filePath: string,
  serviceMigrations: readonly Migration[] = [],
): StoreDatabase {
  if (filePath !== ':memory:') mkdirSync(dirname(filePath), { recursive: true })
  const database = new Database(filePath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  runMigrations(database, [...coreMigrations, ...serviceMigrations])
  return database
}
