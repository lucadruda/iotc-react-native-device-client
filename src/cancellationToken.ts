import { CancellationException } from ".";

type AnyFn = (...args: any) => any | Promise<any>;

export default class CancellationToken {

    private cancelled: boolean;
    constructor() {
        this.cancelled = false;
    }

    throwIfCancelled(lastCompletedStep?: string) {
        if (this.isCancelled()) {
            throw new CancellationException(`Connection aborted${lastCompletedStep ? `: ${lastCompletedStep}.` : '.'}`);
        }
    }

    isCancelled() {
        return this.cancelled === true;
    }

    cancel() {
        this.cancelled = true;
    }

    // could probably do with a `register(func)` method too for cancellation callbacks

}