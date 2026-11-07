import { fetchPost, WithTime } from '../index.js';

const operation = new WithTime();
operation.on('begin', () => console.log('Request started'));
operation.on('data', (post) => console.log(post));
operation.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
operation.on('end', () => console.log('Request finished'));

operation.execute(fetchPost, 1);
