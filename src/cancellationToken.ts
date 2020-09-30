type AnyFn = (...args: any) => any | Promise<any>;

export class CancellationToken {

    public isCancellationRequested: boolean;
    private onCancelledCallbacks: AnyFn[];
    public promise: Promise<any>;


    constructor() {
        this.isCancellationRequested = false;
        this.onCancelledCallbacks = []; // actions to execute when cancelled
        this.onCancelledCallbacks.push(() => this.isCancellationRequested = true);
        // expose a promise to the outside
        this.promise = new Promise(resolve => this.onCancelledCallbacks.push(resolve));
        // let the user add handlers
    }
    public cancel() { this.onCancelledCallbacks.forEach(x => x); }
    public onCancelled(fn: AnyFn) { this.onCancelledCallbacks.push(fn) }
}