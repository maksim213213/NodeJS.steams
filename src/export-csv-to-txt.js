import { exportMovies } from './movie-export.js';

export function exportCsvToTxt({ minYear = 1995, minRating = 8.5 } = {}) {
  return exportMovies({
    inputPath: new URL('./assets/movies.csv', import.meta.url),
    outputPath: new URL('./assets/movies.txt', import.meta.url),
    summaryPath: new URL('./assets/summary.json', import.meta.url),
  }, { minYear, minRating });
}
