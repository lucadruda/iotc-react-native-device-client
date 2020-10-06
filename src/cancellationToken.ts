export class CancellationException implements Error {
    public name: string;

    constructor(public message: string) {
        this.name = 'Cancel'
    }
}


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