import { EventEmitter } from 'node:events';

let executionId = 0;

export class WithTime extends EventEmitter {
  execute(asyncFunc, ...args) {
    const timerLabel = `WithTime:${++executionId}`;
    let completed = false;

    const callback = (error, result) => {
      if (completed) return;
      completed = true;
      console.timeEnd(timerLabel);

      try {
        if (error) {
          this.emit('error', error instanceof Error ? error : new Error(String(error)));
        } else if (result !== undefined) {
          this.emit('data', result);
        }
      } finally {
        this.emit('end');
      }
    };

    console.time(timerLabel);
    try {
      this.emit('begin');
      asyncFunc(...args, callback);
    } catch (error) {
      // Propagate listener exceptions after the operation has completed.
      if (completed) throw error;
      callback(error);
    }

    return this;
  }
}
