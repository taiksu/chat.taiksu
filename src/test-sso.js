/**
 * Script de teste para validação SSO
 * Use: node src/test-sso.js <token>
 */

require('dotenv').config();
const { validateSSOToken } = require('./middleware/ssoValidation');

async function testSSO() {
  const token = process.argv[2];

  if (!token) {
    console.error('❌ Uso: node src/test-sso.js <token>');
    process.exit(1);
  }

  console.log('🧪 Teste de Validação SSO');
  console.log('═'.repeat(50));
  console.log(`\n📝 Configuração:`);
  console.log(`   SSO_URL: ${process.env.SSO_URL}`);
  console.log(`   SSO_VALIDATE_ENDPOINT: ${process.env.SSO_VALIDATE_ENDPOINT}`);
  console.log(`   SSO_TIMEOUT: ${process.env.SSO_TIMEOUT}ms`);
  console.log(`\n🔑 Token (primeiros 30 chars): ${token.substring(0, 30)}...`);
  console.log(`\n📤 Iniciando validação...\n`);

  const result = await validateSSOToken(token);

  console.log('\n' + '═'.repeat(50));
  if (result) {
    console.log('✅ SUCESSO!');
    console.log('\n👤 Dados do usuário:');
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('❌ FALHA na validação');
    console.log('\nVerifique:');
    console.log('  1. Token está válido e não expirou');
    console.log('  2. Conectividade com https://login.taiksu.com.br');
    console.log('  3. Configuração do .env está correta');
    console.log('  4. Verifique os logs acima para mais detalhes');
  }

  process.exit(result ? 0 : 1);
}

testSSO();
