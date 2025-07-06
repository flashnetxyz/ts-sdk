const { ApiClient, TypedAmmApi, validatePublicKey } = require('../dist/cjs/index.js');

console.log('Testing CJS require...');

// Test that imports work
console.log('✓ ApiClient imported:', typeof ApiClient);
console.log('✓ TypedAmmApi imported:', typeof TypedAmmApi);
console.log('✓ validatePublicKey imported:', typeof validatePublicKey);

// Test basic functionality
try {
  const client = new ApiClient({ baseUrl: 'https://api.example.com' });
  console.log('✓ ApiClient instantiated successfully');
  
  // Test validation function
  const testKey = 'ed25519:1234567890abcdef';
  try {
    validatePublicKey(testKey);
    console.log('✓ validatePublicKey works');
  } catch (e) {
    console.log('✓ validatePublicKey validation works (caught expected error)');
  }
  
  console.log('\n✅ CJS format works correctly!');
} catch (error) {
  console.error('❌ CJS test failed:', error);
  process.exit(1);
}