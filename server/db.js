import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'studio.db');
export const DELIVERY_DIR = path.join(DATA_DIR, 'deliveries');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(DELIVERY_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager','maker','client')),
  initials TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  segment TEXT NOT NULL DEFAULT '',
  length_m REAL NOT NULL CHECK (length_m > 0),
  lanes INTEGER NOT NULL CHECK (lanes IN (2,4,6)),
  bores INTEGER NOT NULL DEFAULT 1,
  delivery_date TEXT NOT NULL,
  drawing_spec TEXT NOT NULL DEFAULT 'A1',
  status TEXT NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning','active','delivered')),
  notes TEXT NOT NULL DEFAULT '',
  seed INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  bore_index INTEGER NOT NULL DEFAULT 0,
  start_m REAL NOT NULL,
  end_m REAL NOT NULL,
  assignee_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo','assigned','in_progress','rework','submitted','approved')),
  rework_count INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT,
  approved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sections_uid ON sections(id);
CREATE INDEX IF NOT EXISTS idx_sections_project ON sections(project_id, bore_index, start_m);

CREATE TABLE IF NOT EXISTS elements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
  layer TEXT NOT NULL CHECK (layer IN ('hvac','elec','civil','anno')),
  kind TEXT NOT NULL,
  code TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  bore_index INTEGER NOT NULL DEFAULT 0,
  chainage REAL NOT NULL,
  offset REAL NOT NULL DEFAULT 0,
  angle_deg REAL NOT NULL DEFAULT 0,
  length_override REAL,
  mounted INTEGER NOT NULL DEFAULT 1,
  upstream_id INTEGER,
  downstream_id INTEGER,
  seq INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_elements_project ON elements(project_id);
CREATE INDEX IF NOT EXISTS idx_elements_section ON elements(section_id);
CREATE INDEX IF NOT EXISTS idx_elements_kind ON elements(project_id, kind);

CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  element_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','resolved','waived','superseded')),
  note TEXT NOT NULL DEFAULT '',
  run_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id, status);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  maker_id INTEGER REFERENCES users(id),
  reviewer_id INTEGER REFERENCES users(id),
  round INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','approved','rejected')),
  reason TEXT NOT NULL DEFAULT '',
  issue_snapshot TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  manifest TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`;

export function initSchema() {
  db.exec(SCHEMA);
}

export function nowIso() {
  return new Date().toISOString();
}

let txDepth = 0;

export function tx(fn) {
  if (txDepth > 0) {           // nested call: join the outer transaction
    txDepth++;
    try { return fn(); } finally { txDepth--; }
  }
  db.exec('BEGIN IMMEDIATE');
  txDepth = 1;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    txDepth = 0;
  }
}

export function audit(projectId, actor, action, detail = '') {
  db.prepare(
    'INSERT INTO audit (project_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(projectId ?? null, actor, action, detail, nowIso());
}
