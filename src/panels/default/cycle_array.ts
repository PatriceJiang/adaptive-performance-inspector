
export class CircleArray<T> {
    data: T[] = [];
    curr: number = 0;
    maxLength: number;
    constructor(maxLength: number) {
        this.maxLength = maxLength;
    }
    get length() {
        return Math.min(this.maxLength, this.data.length);
    }
    push(e: T) {
        this.data[this.curr] = e;
        this.curr = (this.curr + 1) % this.maxLength;
    }

    last() {
        if (this.data.length === 0) return null;
        return this.data[(this.curr - 1 + this.maxLength) % this.maxLength];
    }

    back(n: number) {
        return this.data[(this.curr + this.length - n - 1) % this.length];
    }

    mapTail<X>(cnt: number, fn: (e: T) => X) {
        if (this.length === 0) return [];
        const m = this.maxLength;
        const l = this.length;
        const c = this.curr;
        let start = (c - cnt + l) % l;
        const ret: X[] = [];
        try {
            do {
                ret.push(fn(this.data[start]));
                start = (start + 1) % m;
            } while (start != c);
        } catch (_) {
            debugger;
        }
        return ret;
    }
    mapAll<X>(fn: (e: T) => X) {
        return this.mapTail(this.length, fn);
    }

    reset() {
        this.data.length = 0;
        this.curr = 0;
    }
}
