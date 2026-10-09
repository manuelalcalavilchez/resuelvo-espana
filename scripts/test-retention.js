'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resuelvo-retention-'));
process.env.RESUELVO_DATA_DIR = tempDir;

try {
  const now = Date.now();
  fs.writeFileSync(path.join(tempDir, 'solicitudes.json'), JSON.stringify([
    { id: 'EXPIRED', retention_until: new Date(now - 1000).toISOString(), cliente: { telefono: 'test' } },
    { id: 'FUTURE', retention_until: new Date(now + 86400000).toISOString(), cliente: { telefono: 'test' } },
    { id: 'INVALID_DATE', retention_until: 'not-a-date', cliente: { telefono: 'test' } }
  ]));
  fs.writeFileSync(path.join(tempDir, 'marketplace-audit.json'), '[]');

  require('../marketplace');

  const leads = JSON.parse(fs.readFileSync(path.join(tempDir, 'solicitudes.json'), 'utf8'));
  assert.deepEqual(leads.map(lead => lead.id), ['FUTURE', 'INVALID_DATE']);

  const audit = JSON.parse(fs.readFileSync(path.join(tempDir, 'marketplace-audit.json'), 'utf8'));
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'leads.retention_purged');
  assert.equal(audit[0].details.count, 1);

  console.log('PASS: expired lead removed; future/invalid retention dates preserved; audit entry recorded.');
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
