// Read-only probe of the slide host. Uploads nothing.
import { check } from './host/supabase.js';
try {
  const b = await check();
  console.log(`bucket "${b.name}" — public: ${b.public}, created ${b.created_at?.slice(0,10) ?? '?'}`);
  console.log('host OK');
} catch (e) { console.error('host FAILED:', e.message); process.exit(1); }
