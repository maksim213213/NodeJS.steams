# NodeJS.steams

Two Node.js exercises cover timing a callback-based operation with `EventEmitter` and streaming a movie catalog from CSV to newline-delimited JSON.

## Run the exercises

Use Node.js 22 or later. Run the commands from the project folder.

```sh
npm ci
npm run demo:time
npm run export:movies
npm test
```

The timing demo fetches post `1` from JSONPlaceholder. The test suite uses mocked responses and temporary files.

## WithTime

`WithTime` extends `EventEmitter`. Its `execute(asyncFunc, ...args)` method forwards the arguments and appends an error-first callback. The class starts and stops a separate console timer for each execution.

| Event | When it fires |
| --- | --- |
| `begin` | Before the operation starts. |
| `data` | On success with a result other than `undefined`. |
| `error` | On failure with an `Error` object. |
| `end` | After the success or error event. |

```js
import { fetchPost, WithTime } from './src/index.js';

const timer = new WithTime();
timer.on('begin', () => console.log('Request started'));
timer.on('data', (post) => console.log(post));
timer.on('error', (error) => console.error(error.message));
timer.on('end', () => console.log('Request finished'));
timer.execute(fetchPost, 1);
```

`fetchPost` forwards network failures, unsuccessful HTTP responses, and JSON parsing errors to the callback. Attach an `error` listener to handle these failures.

## Movie export

```js
import { exportCsvToTxt } from './src/index.js';

const summary = await exportCsvToTxt({ minYear: 1995, minRating: 8.5 });
console.log(summary);
```

Both thresholds are optional and inclusive. The exporter reads [`movies.csv`](src/assets/movies.csv) with `csvtojson`, which handles semicolon delimiters and quoted titles. Each row with a nonnumeric year or rating counts as invalid. Valid rows below either threshold count as filtered. The exporter normalizes decimal commas in ratings and adds `decade` and `length` to each accepted movie.

The exporter writes one JSON object per line to [`movies.txt`](src/assets/movies.txt). It processes rows as they arrive and waits for `drain` whenever the output stream applies backpressure. It returns the statistics after both output files are written and rejects if reading, parsing, or writing fails.

The default run produces the following [`summary.json`](src/assets/summary.json).

```json
{
  "processed": 15,
  "exported": 8,
  "skipped": { "invalid": 1, "filtered": 6 },
  "byDecade": { "1990s": 2, "2000s": 2, "2010s": 4 }
}
```

The tests cover event order, HTTP and network errors, the expected output, quoted fields, custom thresholds, stream backpressure, and cleanup on failures.
