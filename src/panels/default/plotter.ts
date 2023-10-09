import { CircleArray } from "./cycle_array";
import { ScalerI, DataI, key_type, value_type } from "./types";
import { formatValue } from './utils';

const PADDING = 10;
const xSeg = 1;
const LABEL_SIZE = 12;

export class DataPlot {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    data: CircleArray<DataI> = new CircleArray(1600);
    private _activeField?: string;
    private _pause = false;
    cursorLine: number = -1;
    dirty: boolean = true;
    address: string;
    lastUpdate:Date|null = null;
    constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, address: string) {
        this.canvas = canvas;
        this.ctx = context
        this.address = address;
    }
    get width() { return this.canvas.width; }
    get height() { return this.canvas.height; }

    push(ele: DataI): boolean {
        this.lastUpdate = new Date;
        if(this.pause) {
            return false;
        }
        this.data.push(ele);
        this.dirty = true;
        return true;
    }

    clear() {
        const c = this.ctx;
        // c.fillStyle = 'rgba(255,255,255,0)';
        c.clearRect(0, 0, this.width, this.height);
        c.fill();
    }

    reset() {
        this.dirty = true;
        this.data.reset();
        this._activeField = undefined;
        this._pause = false;
        this.cursorLine = -1;
    }

    active(field: string) {
        this._activeField = field;
        this.dirty = true;
    }

    deactive(field: string) {
        this._activeField = undefined;
        this.dirty = true;
    }

    get pause(): boolean { return this._pause; }
    set pause(v: boolean) { this._pause = v; }

    get left() { return PADDING; }
    get bottom() { return this.height - 2 * PADDING; }
    get right() { return this.width - 2 * PADDING; }
    get top() { return PADDING; }
    get H() { return this.bottom - this.top; }
    get W() { return this.right - this.left; }
    get dotCount() { return Math.min(Math.floor(this.W / xSeg), this.data.length); }

    drawWithFilter(color: string, field: string, title: string, bottomRange: number, topRange: number, mapper: (d: DataI) => number, expandBottom = false, expandTop = false) {
        const c = this.ctx;
        const list = this.data.mapTail(this.dotCount, mapper);
        if (list.length < 2) return;

        if (expandBottom || expandTop) {
            list.forEach(v => {
                if (expandBottom) bottomRange = Math.min(v, bottomRange);
                if (expandTop) topRange = Math.max(v, topRange);
            });
        }
        let maxValue = Number.MAX_VALUE;
        let minValue = Number.MIN_VALUE;
        const rescaleList = list.map(x => {
            maxValue = x < maxValue ? x : maxValue;
            minValue = x > minValue ? x : minValue;
            return (x - bottomRange) / (topRange - bottomRange);
        });


        c.save();
        const isActive = this._activeField && this._activeField === field;
        if (!this._activeField) {
            c.strokeStyle = color;
            c.lineWidth = 1;
        } else {
            c.strokeStyle = isActive ? color : 'rgba(255,255,255, 0.3)';
            c.lineWidth = isActive ? 1.2 : 0.5;
        }
        const first = rescaleList[0];
        const left = this.left;
        const bottom = this.bottom;
        const H = this.H;
        let x = 0;
        let y = 0;
        c.beginPath();
        c.moveTo(left, bottom - first * H);
        for (let i = 1; i < rescaleList.length; i++) {
            x = left + i * xSeg;
            y = bottom - rescaleList[i] * H;
            c.lineTo(x, y);
            c.moveTo(x, y);
        }
        c.closePath();
        c.stroke();
        if (isActive) {
            const vMax = (minValue - bottomRange) / (topRange - bottomRange);
            const vMin = (maxValue - bottomRange) / (topRange - bottomRange);
            const maxH = bottom - vMax * H;
            const minH = bottom - vMin * H;
            const displayRange = Math.abs(minValue - maxValue) > 1e-4;
            if (displayRange) {
                c.strokeStyle = `rgba(255, 255, 255, 0.7)`;
                c.beginPath();
                c.moveTo(left, maxH);
                c.lineTo(x, maxH);
                c.moveTo(left, minH);
                c.lineTo(x, minH);
                c.stroke();
            }
            const minStr = formatValue(maxValue);
            const maxStr = formatValue(minValue);
            let labelTop = maxH - LABEL_SIZE + 2;
            let labelBottom = minH + LABEL_SIZE + 5;
            labelTop = Math.max(LABEL_SIZE + 5, labelTop);
            labelBottom = Math.min(this.height - LABEL_SIZE, labelBottom);
            this.drawLabel(x / 2, labelTop, `${maxStr}`, color);
            if (displayRange) {
                this.drawLabel(x / 2, labelBottom, `${minStr}`, color);
            }
            this.drawLabel(60, 34, title || field, color);
        }
        c.restore();

    }

    drawPauseState() {
        const c = this.ctx;
        c.save();
        c.fillStyle = "rgba(255,255,255, 0.6)";
        if (this.pause) {
            c.beginPath();
            c.fillRect(20, 20, 5, 20);
            c.fillRect(30, 20, 5, 20);
            c.closePath();
            c.fill();
        } else {
            c.beginPath();
            c.moveTo(25, 20);
            c.lineTo(35, 30);
            c.lineTo(25, 40);
            c.closePath();
            c.fill();
        }
        c.restore();
    }

    drawCursorLine(): boolean {
        if (this.cursorLine < 0) return false;
        if (this.cursorLine > PADDING + this.data.length * xSeg) return false;
        if (this.cursorLine < PADDING)
            this.cursorLine = PADDING;
        const c = this.ctx;
        c.save();
        c.strokeStyle = "rgba(255,255,255, 0.4)";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(this.cursorLine, 0)
        c.lineTo(this.cursorLine, this.height);
        c.closePath();
        c.stroke();
        c.restore();
        return true;
    }

    sample<K extends key_type>(attr: K): value_type<K> | null {
        const l = Math.floor((this.cursorLine - PADDING) / xSeg);
        const i = this.dotCount - l;
        if (i < 0 && i >= this.data.length) return null;
        const back = this.data.back(i);
        if (!back) return null;
        return back[attr as key_type] as any;
    }

    drawLabel(x: number, y: number, text: string, color: string) {
        const c = this.ctx;
        c.save();
        const fontSize = LABEL_SIZE;
        c.font = `${12}px Arial`;
        const m = c.measureText(text);
        c.fillStyle = 'rgba(0,0,0,0.8)';
        c.fillRect(x - 3, y - 15, m.width + 6, fontSize + 9);
        c.fillStyle = color;
        c.fillText(text, x, y);
        c.restore();
    }
}


export class PlotterManager {
    private plotters: { [key: string]: DataPlot } = {};
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private currentAddress: string | null = null;
    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d')!;
    }

    load(addr: string) {
        let p = this.plotters[addr];
        if (!p) {
            p = this.plotters[addr] = new DataPlot(this.canvas, this.context, addr);
        }
        if (!this.currentAddress) {
            this.currentAddress = addr;
        }
        return p;
    }

    dft(addr?: string): DataPlot | null {
        if (addr) {
            this.currentAddress = addr;
        }
        if (!this.currentAddress) {
            return null;
        }
        return this.load(this.currentAddress);
    }

    clear() {
        this.plotters = {};
        this.currentAddress = null;
    }

    process(fn:(p:DataPlot)=>void) {
        const d = this.dft();
        if(d) {
            fn(d);
        }
    }

    dispatchData(addr:string, data:DataI) {
        this.load(addr)?.push(data);
    }
}
