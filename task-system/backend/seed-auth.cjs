// seed-auth.cjs — Crea los usuarios existentes en Supabase Auth y los linkea
// (users.auth_id). Idempotente: si ya existen, solo re-linkea.
// Correr UNA vez, DESPUÉS de aplicar MIGRACION-SUPABASE.sql:
//   node seed-auth.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Mismo slug que usa el frontend para mapear "usuario" -> email interno.
function slug(username) {
  return username.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}
const emailFor = (u) => `${slug(u)}@mghogar.local`;

// Usuarios existentes + sus contraseñas nuevas (definidas por el dueño).
const SEED = [
  { username: 'Alejandro', password: 'Solorba05' },
  { username: 'Empleado 1', password: 'emp1pass' },
];

async function findAuthUserByEmail(email) {
  // Pagina por las primeras páginas buscando el email (pocos usuarios).
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find(u => u.email === email);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

(async () => {
  for (const { username, password } of SEED) {
    const email = emailFor(username);

    // 1) ¿Existe la fila en public.users?
    const { data: profile, error: pErr } = await db
      .from('users').select('id, username, role, auth_id').eq('username', username).single();
    if (pErr || !profile) {
      console.log(`✗ "${username}": no existe en public.users — salteado`);
      continue;
    }

    // 2) Crear (o recuperar) el usuario en Supabase Auth.
    let authUser = null;
    const { data: created, error: cErr } = await db.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { username, full_name: profile.username },
    });
    if (cErr) {
      if (/already|registered|exists/i.test(cErr.message)) {
        authUser = await findAuthUserByEmail(email);
        if (authUser) {
          // Asegurar la contraseña pedida.
          await db.auth.admin.updateUserById(authUser.id, { password, email_confirm: true });
          console.log(`• "${username}": ya existía en Auth — contraseña actualizada`);
        }
      } else {
        console.log(`✗ "${username}": error creando en Auth:`, cErr.message);
        continue;
      }
    } else {
      authUser = created.user;
      console.log(`✓ "${username}": creado en Auth (${email})`);
    }
    if (!authUser) { console.log(`✗ "${username}": no se pudo obtener authUser`); continue; }

    // 3) Linkear auth_id en public.users.
    const { error: uErr } = await db.from('users').update({ auth_id: authUser.id }).eq('id', profile.id);
    if (uErr) console.log(`✗ "${username}": error linkeando auth_id:`, uErr.message);
    else console.log(`  → linkeado: users.id=${profile.id} (${profile.role}) ⇄ auth ${authUser.id}`);
  }
  console.log('\nListo. Login: usuario="Alejandro" pass="Solorba05" | usuario="Empleado 1" pass="emp1pass"');
})();
