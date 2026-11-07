import { exportCsvToTxt } from '../index.js';

try {
  console.log(await exportCsvToTxt());
} catch (error) {
  console.error('Movie export failed:', error.message);
  process.exitCode = 1;
}
