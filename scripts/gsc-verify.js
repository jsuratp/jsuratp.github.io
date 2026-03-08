import fs from 'fs';
import path from 'path';

// This script generates the GSC verification file if GSC_CODE is set
// Usage: node scripts/gsc-verify.js <GSC_CODE>

const gscCode = process.argv[2];

if (gscCode) {
  const fileName = `google${gscCode}.html`;
  const content = `google-site-verification: google${gscCode}.html`;
  
  const publicDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  fs.writeFileSync(path.join(publicDir, fileName), content);
  console.log(`Generated GSC verification file: ${fileName}`);
} else {
  console.log('No GSC_CODE provided, skipping verification file generation.');
}
