const bcrypt = require('bcryptjs');
const pass = process.argv[2];

if (!pass) {
  console.log('Uso: node hash.js <tu_contraseña>');
  process.exit(1);
}

const hash = bcrypt.hashSync(pass, 10);
console.log('\nContraseña:', pass);
console.log('Hash (Cópialo en Supabase):', hash);
console.log('');
