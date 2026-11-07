import { once } from 'node:events';
import fs from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { finished, pipeline } from 'node:stream/promises';
import csv from 'csvtojson';

// Paths are supplied separately so tests can use isolated temporary files.
export async function exportMovies(
  { inputPath, outputPath, summaryPath },
  { minYear = 1995, minRating = 8.5 } = {},
) {
  if (!Number.isFinite(minYear) || !Number.isFinite(minRating)) {
    throw new TypeError('minYear and minRating must be finite numbers');
  }

  const summary = {
    processed: 0,
    exported: 0,
    skipped: { invalid: 0, filtered: 0 },
    byDecade: {},
  };
  const controller = new AbortController();
  const output = fs.createWriteStream(outputPath, { encoding: 'utf8' });
  const outputFinished = finished(output, { cleanup: true });

  // Observe errors immediately, including failures before the first row is read.
  // Aborting also interrupts any pending drain wait or read from the parser.
  outputFinished.catch((error) => controller.abort(error));

  try {
    await pipeline(
      fs.createReadStream(inputPath),
      csv({ delimiter: ';', checkColumn: true, needEmitAll: false }, { objectMode: true }),
      async (rows, { signal }) => {
        for await (const row of rows) {
          const movie = processRow(row, summary, minYear, minRating);
          if (!movie) continue;

          if (!output.write(JSON.stringify(movie) + '\n')) {
            await once(output, 'drain', { signal });
          }
          summary.exported += 1;
          summary.byDecade[movie.decade] = (summary.byDecade[movie.decade] ?? 0) + 1;
        }
        output.end();
        await outputFinished;
      },
      { signal: controller.signal },
    );

    await writeFile(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
    return summary;
  } catch (error) {
    const failure = controller.signal.aborted ? controller.signal.reason : error;
    output.destroy();
    await outputFinished.catch(() => {});
    throw failure;
  }
}

function processRow(row, summary, minYear, minRating) {
  summary.processed += 1;
  const year = parseNumber(row.Year);
  const rating = parseNumber(row.Rating?.replace(',', '.'));

  if (!Number.isFinite(year) || !Number.isFinite(rating)) {
    summary.skipped.invalid += 1;
    return null;
  }
  if (year < minYear || rating < minRating) {
    summary.skipped.filtered += 1;
    return null;
  }

  const duration = Number(row.Duration);
  return {
    movie: row.Movie,
    director: row.Director,
    year,
    rating,
    decade: `${Math.floor(year / 10) * 10}s`,
    length: `${Math.floor(duration / 60)}h ${duration % 60}m`,
  };
}

function parseNumber(value) {
  const normalized = String(value ?? '').trim();
  return normalized === '' ? NaN : Number(normalized);
}
