import assert from 'node:assert/strict';
import fs from 'node:fs';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';
import { exportMovies } from '../src/movie-export.js';

const header = 'Movie;Director;Year;Duration;Rating\n';
const sampleCsv = new URL('../src/assets/movies.csv', import.meta.url);
const expectedSummary = {
  processed: 15,
  exported: 8,
  skipped: { invalid: 1, filtered: 6 },
  byDecade: { '1990s': 2, '2000s': 2, '2010s': 4 },
};
const expectedMovies = [
  ['Inception', 'Christopher Nolan', 2010, 8.8, '2010s', '2h 28m'],
  ['The Matrix', 'Lana Wachowski', 1999, 8.7, '1990s', '2h 16m'],
  ['Interstellar', 'Christopher Nolan', 2014, 8.7, '2010s', '2h 49m'],
  ['Fight Club', 'David Fincher', 1999, 8.8, '1990s', '2h 19m'],
  ['Parasite', 'Bong Joon-ho', 2019, 8.5, '2010s', '2h 12m'],
  ['Spirited Away', 'Hayao Miyazaki', 2001, 8.6, '2000s', '2h 5m'],
  ['Gladiator', 'Ridley Scott', 2000, 8.5, '2000s', '2h 35m'],
  ['Whiplash', 'Damien Chazelle', 2014, 8.5, '2010s', '1h 46m'],
].map(([movie, director, year, rating, decade, length]) => ({
  movie, director, year, rating, decade, length,
}));

async function fixture(t, csvText) {
  const directory = await mkdtemp(join(tmpdir(), 'movies-export-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const paths = {
    inputPath: join(directory, 'movies.csv'),
    outputPath: join(directory, 'movies.txt'),
    summaryPath: join(directory, 'summary.json'),
  };
  if (csvText === undefined) await copyFile(sampleCsv, paths.inputPath);
  else await writeFile(paths.inputPath, header + csvText);
  return paths;
}

test('exports exactly the eight required records and persists the returned summary', async (t) => {
  const paths = await fixture(t);
  const summary = await exportMovies(paths);
  assert.deepEqual(summary, expectedSummary);
  assert.deepEqual(JSON.parse(await readFile(paths.summaryPath, 'utf8')), summary);
  const text = await readFile(paths.outputPath, 'utf8');
  assert.equal(text, expectedMovies.map((movie) => JSON.stringify(movie) + '\n').join(''));
});

test('applies custom inclusive thresholds and preserves semicolons in quoted titles', async (t) => {
  const paths = await fixture(t);
  const summary = await exportMovies(paths, { minYear: 2000, minRating: 7.9 });
  const movies = (await readFile(paths.outputPath, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(summary.exported, 8);
  assert.equal(movies.find((movie) => movie.director === 'Ang Lee').movie, 'Crouching Tiger; Hidden Dragon');
  assert.equal(movies.find((movie) => movie.director === 'Ang Lee').rating, 7.9);
  assert.ok(movies.every((movie) => movie.year >= 2000 && movie.rating >= 7.9));
});

test('rejects empty, nonnumeric, infinite, and partially numeric year/rating values as invalid', async (t) => {
  const paths = await fixture(t, [
    'Empty year;Director;;120;9',
    'Empty rating;Director;2000;120;',
    'Bad year;Director;year;120;9',
    'Comma in year;Director;2000,5;120;9',
    'Infinite rating;Director;2000;120;Infinity',
    'Partial rating;Director;2000;120;8,8oops',
    'Valid boundary;Director;1995;60;8,5',
  ].join('\n'));
  const summary = await exportMovies(paths);
  assert.deepEqual(summary, {
    processed: 7, exported: 1, skipped: { invalid: 6, filtered: 0 }, byDecade: { '1990s': 1 },
  });
});

test('writes empty output and zero statistics for a header-only file', async (t) => {
  const paths = await fixture(t, '');
  assert.deepEqual(await exportMovies(paths), {
    processed: 0, exported: 0, skipped: { invalid: 0, filtered: 0 }, byDecade: {},
  });
  assert.equal(await readFile(paths.outputPath, 'utf8'), '');
  assert.ok(JSON.parse(await readFile(paths.summaryPath, 'utf8')));
});

test('handles quoted multiline fields without splitting one record into multiple movies', async (t) => {
  const paths = await fixture(t, '"A; movie\nwith two lines";Director;2010;125;9\n');
  const summary = await exportMovies(paths);
  assert.equal(summary.processed, 1);
  const text = await readFile(paths.outputPath, 'utf8');
  assert.equal(text.trim().split('\n').length, 1);
  assert.equal(JSON.parse(text).movie, 'A; movie\nwith two lines');
});

test('rejects a missing input promptly and closes the output stream', { timeout: 5000 }, async (t) => {
  const paths = await fixture(t);
  await rm(paths.inputPath);
  const original = fs.createWriteStream;
  let output;
  t.mock.method(fs, 'createWriteStream', (...args) => (output = original(...args)));
  await assert.rejects(exportMovies(paths), { code: 'ENOENT' });
  assert.equal(output.closed, true);
});

test('rejects malformed CSV and closes the input and output streams', { timeout: 5000 }, async (t) => {
  const paths = await fixture(t, '"Unterminated title;Director;2010;120;9\n');
  const originalRead = fs.createReadStream;
  const originalWrite = fs.createWriteStream;
  let input;
  let output;
  t.mock.method(fs, 'createReadStream', (...args) => (input = originalRead(...args)));
  t.mock.method(fs, 'createWriteStream', (...args) => (output = originalWrite(...args)));
  await assert.rejects(exportMovies(paths));
  assert.equal(input.closed, true);
  assert.equal(output.closed, true);
});

test('rejects an output open failure and closes the input', { timeout: 5000 }, async (t) => {
  const paths = await fixture(t);
  paths.outputPath = join(paths.inputPath, 'impossible.txt');
  const original = fs.createReadStream;
  let input;
  t.mock.method(fs, 'createReadStream', (...args) => (input = original(...args)));
  await assert.rejects(exportMovies(paths));
  assert.equal(input.closed, true);
});

test('rejects a summary write failure after closing the movie streams', { timeout: 5000 }, async (t) => {
  const paths = await fixture(t);
  paths.summaryPath = join(paths.inputPath, 'impossible.json');
  await assert.rejects(exportMovies(paths));
  assert.equal((await readFile(paths.outputPath, 'utf8')).trim().split('\n').length, 8);
});

test('waits for drain with a slow writer and resolves only after the output closes', { timeout: 5000 }, async (t) => {
  const paths = await fixture(t);
  let draining = false;
  let drainCount = 0;
  let finalCompleted = false;
  const chunks = [];
  const output = new Writable({
    highWaterMark: 1,
    write(chunk, encoding, callback) {
      assert.equal(draining, false, 'a new write must wait for drain');
      draining = true;
      chunks.push(chunk.toString());
      setTimeout(callback, 2);
    },
    final(callback) {
      setTimeout(() => { finalCompleted = true; callback(); }, 5);
    },
  });
  output.on('drain', () => { draining = false; drainCount += 1; });
  t.mock.method(fs, 'createWriteStream', () => output);
  const summary = await exportMovies(paths);
  assert.equal(drainCount, 8);
  assert.equal(finalCompleted, true);
  assert.equal(output.closed, true);
  assert.equal(chunks.join(''), expectedMovies.map((movie) => JSON.stringify(movie) + '\n').join(''));
  assert.deepEqual(JSON.parse(await readFile(paths.summaryPath, 'utf8')), summary);
});

test('rejects write errors while waiting for drain and closes all streams', { timeout: 5000 }, async (t) => {
  const paths = await fixture(t);
  const error = new Error('Disk full');
  const output = new Writable({
    highWaterMark: 1,
    write(chunk, encoding, callback) { setImmediate(callback, error); },
  });
  const original = fs.createReadStream;
  let input;
  t.mock.method(fs, 'createReadStream', (...args) => (input = original(...args)));
  t.mock.method(fs, 'createWriteStream', () => output);
  await assert.rejects(exportMovies(paths), error);
  assert.equal(input.closed, true);
  assert.equal(output.closed, true);
});

test('rejects premature output closure instead of waiting forever for drain', { timeout: 5000 }, async (t) => {
  const paths = await fixture(t);
  const output = new Writable({
    highWaterMark: 1,
    write() { setImmediate(() => this.destroy()); },
  });
  t.mock.method(fs, 'createWriteStream', () => output);
  await assert.rejects(exportMovies(paths), { code: 'ERR_STREAM_PREMATURE_CLOSE' });
  assert.equal(output.closed, true);
});

test('rejects mismatched CSV column counts', async (t) => {
  const paths = await fixture(t, 'Movie;Director;2000;120;9;extra\n');
  await assert.rejects(exportMovies(paths));
});
