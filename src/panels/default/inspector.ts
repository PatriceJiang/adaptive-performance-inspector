const dgram = require('dgram');
const net = require('net');
const os = require('os');

let $: any = undefined;

interface ScalerI {
    name: string;
    active: boolean;
    minLevel: number;
    maxLevel: number;
    level: number;
    cost: number;
}

interface DataI {
    enabled: boolean;
    thermalValue: number;
    performanceLevel: number;
    thermalTrends: number;
    frameTime: number;
    frameTimeEMA: number;
    cpuTime: number;
    gpuTime: number;
    bottleneck: number;
    scalers: ScalerI[]
}

class CircleArray<T> {
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


function formatValue(value: number, n: number = 3): string | number {
    return Math.abs(value - Math.floor(value)) < 1e-5 ? Math.round(value) : value.toFixed(n);
}

const PADDING = 10;
const xSeg = 1;
const LABEL_SIZE = 12;
class DataPlot {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    data: CircleArray<DataI> = new CircleArray(1600);
    private _activeLabel?: string;
    private _pause = false;
    cursorLine: number = -1;
    constructor(selector: string) {
        this.canvas = <HTMLCanvasElement>$.app.querySelector(selector);
        this.ctx = this.canvas.getContext('2d')!;
    }
    get width() { return this.canvas.width; }
    get height() { return this.canvas.height; }

    push(ele: DataI) {
        this.data.push(ele);
    }

    clear() {
        const c = this.ctx;
        // c.fillStyle = 'rgba(255,255,255,0)';
        c.clearRect(0, 0, this.width, this.height);
        c.fill();
    }

    reset() {
        this.data.reset();
        this._activeLabel = undefined;
        this._pause = false;
        this.cursorLine = -1;
    }

    active(title: string) {
        this._activeLabel = title;
    }

    deactive(title: string) {
        this._activeLabel = undefined;
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

    drawWithFilter(color: string, label: string, bottomRange: number, topRange: number, mapper: (d: DataI) => number, expandBottom = false, expandTop = false) {
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
        const isActive = this._activeLabel && this._activeLabel === label;
        if (!this._activeLabel) {
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
            this.drawLabel(60, 34, label, color);
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
        return this.data.back(i)[attr as key_type] as any;
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


function find_port(startPort: number, endPort: number = startPort + 10): Promise<number> {
    return new Promise((resolve, reject) => {

        const bindPort = (port: number) => {
            const server = net.createServer();
            server.on('listening', () => {
                server.close(() => {
                    resolve(port);
                });
            });
            server.on('error', (err: Error) => {
                setTimeout(() => {
                    if (port < endPort) {
                        bindPort(port + 1);
                    } else {
                        reject(err);
                    }
                }, 0);
            });
            server.listen({ port, exclusive: true }, () => { });
        };
        bindPort(startPort);
    });
}

function server_bind(server: any, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        server.bind(port, '0.0.0.0', (err: Error) => {
            if (err) { reject(err); return; }
            resolve();
        })
    })
}

const clearupTasks: { (): void }[] = [];

let plotter: DataPlot;

function getPlotter() {
    if (!$.app.querySelector("#ad-perf-chart")) {
        return null;
    }
    if (!plotter) plotter = new DataPlot('#ad-perf-chart');
    return plotter;
}
export async function setup_server(ctx: any) {
    $ = ctx;
    const port = await find_port(4000, 5000);
    const server = dgram.createSocket('udp4');
    server.on('error', (error: Error) => {
        console.error('Udp Server Error');
        console.error(error);
    });
    server.on('message', (msg: any, rinfo: any) => {
        const srcaddr = rinfo.address;
        const srcport = rinfo.port;
        try {
            const data = JSON.parse(msg);
            // console.log(`mesages: ${data}, from ${srcaddr}:${srcport}`);
            acceptData(data);
        } catch (e) {
            console.error(e);
        }
    });

    await server_bind(server, port);
    server.setBroadcast(true);

    const encoder = new TextEncoder();
    const broadcastMsg = encoder.encode('cocos-adaptive-performance;sdfsdfsdfsf;');
    const buffer = Buffer.from(broadcastMsg.buffer);
    const broadcastTask = setInterval(() => {
        const addresses = getBroadcastAddress();
        for (let addr of addresses) {
            server.send(buffer, 9933, addr, (err: any) => {
                if (err) {
                    console.error(`broadcast error ${err}`);
                }
            });
        }
    }, 2000);

    clearupTasks.push(() => {
        clearInterval(broadcastTask);
        server.close();
    });
}


export function tear_down_server() {
    clearupTasks.forEach(x => x());
    clearupTasks.length = 0;
}

function convertToBroadcastAddr(ip: string, mask: string): string | null {
    if (ip.startsWith('192.168.') ||
        ip.startsWith('172.') ||
        ip.startsWith('10.')
    ) {
        const maskBits = mask.split('.').map(x => Number.parseInt(x, 10));
        const addressBits = ip.split('.').map(x => Number.parseInt(x, 10));
        const maskInvBits = maskBits.map(x => (~x) & 0x000000FF);
        const targetBits = addressBits.map((x, i) => (x & maskBits[i]) | maskInvBits[i]);
        return targetBits.map(x => `${x}`).join('.');
    }
    return null;
}

function getBroadcastAddress() {
    const interfaces = os.networkInterfaces();
    const ret: string[] = [];
    for (const name in interfaces) {
        const addresses = interfaces[name];
        for (const addr of addresses) {
            if (addr.family === 'IPv4' && !addr.internal) {
                const dst = convertToBroadcastAddr(addr.address, addr.netmask);
                if (dst) ret.push(dst);
            }
        }
    }
    return ret;
}


let moduleList: HTMLUListElement | null = null;
const moduleColors: { [k in keyof DataI]: string } = {} as any;
type key_type = keyof DataI & string;
type value_type<K extends key_type> = DataI[K]

const labelMap: { [k in keyof Partial<DataI>]: string } = {
    'frameTime': 'Frame Time',
    'cpuTime': 'CPU Time',
    'gpuTime': 'GPU Time',
    'thermalValue': 'Thermal Value',
    'thermalTrends': 'Thermal Trends',
    'performanceLevel': 'Performance Level',
};

function processAllModules(fn: (name: key_type, title: string) => void) {
    Object.keys(labelMap).forEach(x => {
        fn(x as key_type, (labelMap as any)[x]);
    });
}

function acceptData(data: DataI) {
    if (getPlotter()) {
        if (!moduleList) {
            let c = (steps: number, i = 0) => () => `hsla(${Math.round(steps * i++)}, 70%, 60%, 0.9)`;
            const t = (key: key_type, title: string, color: string) => {
                const span = document.createElement('span');
                span.classList.add('ad-perf-module-color');
                span.style.backgroundColor = color;
                const li = document.createElement('li');
                li.appendChild(span);
                const tt = document.createTextNode(title);
                li.appendChild(tt);

                li.addEventListener('mouseenter', () => plotter.active(key));
                li.addEventListener('mouseleave', () => plotter.deactive(key));
                return li;
            };

            const cc = c(360 / 6);
            moduleList = $.app.querySelector('.ad-perf-data-modules-list ul');
            moduleList!.innerHTML = "";
            moduleColors.cpuTime = cc();
            moduleColors.gpuTime = cc();
            moduleColors.frameTime = cc();
            moduleColors.performanceLevel = cc();
            moduleColors.thermalValue = cc();
            moduleColors.thermalTrends = cc();
            const at = (key: key_type, title: string) => {
                moduleList?.appendChild(t(key, title, moduleColors[key]))
            };
            processAllModules(at);
        }
        if (!plotter.pause) {
            plotter.push(data);
            const bottleneck = <HTMLDivElement>$.app.querySelector('.ad-perf-bottleneck-value');
            const list = ['None', 'CPU', 'GPU', 'CPU & GPU'];
            bottleneck.innerHTML = list[data.bottleneck] || 'unknown';
            bottleneck.style.backgroundColor = data.bottleneck === 0 ? 'green' : 'red';

            drawThermometer(data.thermalValue);
        }
        requestAnimationFrame(() => {
            plotter.clear();
            plotter.drawWithFilter(moduleColors.cpuTime, 'cpuTime', 0, 20, (d) => d.cpuTime, false, true);
            plotter.drawWithFilter(moduleColors.gpuTime, 'gpuTime', 0, 20, (d) => d.gpuTime);
            plotter.drawWithFilter(moduleColors.thermalValue, 'thermalValue', 10, -10, (d) => d.thermalValue, true, true);
            plotter.drawWithFilter(moduleColors.thermalTrends, 'thermalTrends', 0, 4, (d) => d.thermalTrends);
            plotter.drawWithFilter(moduleColors.performanceLevel, 'performanceLevel', 0, 4, (d) => d.performanceLevel);
            plotter.drawWithFilter(moduleColors.frameTime, 'frameTime', 0, 20, (d) => d.frameTime, false, true);
            const hasCursor = plotter.drawCursorLine();
            if (hasCursor) {
                let x = plotter.cursorLine + 8;
                const p = (delta: number, i = 0) => () => 40 + delta * i++;
                const pp = p(25);
                const lb = (k: key_type, title: string) => {
                    const v = <number>plotter.sample(k);
                    plotter.drawLabel(x, pp(), title + ": " + formatValue(v, 2), moduleColors[k]);
                }
                processAllModules(lb);
            }
            plotter.drawPauseState();
            const scalers = plotter.sample('scalers');
            updateScalers(scalers || [], hasCursor);
        });
    }
}

let thermometrGL: WebGLRenderingContext;
let ufValueLocation: WebGLUniformLocation;
let ufWidthLocation: WebGLUniformLocation;
let thermalCanvasWidth: number;

export function setup_html($: any) {
    const div = <HTMLDivElement>$.app.querySelector(".ad-perf-data-paint");
    const canvas = <HTMLCanvasElement>div.querySelector('canvas');
    canvas.width = div.clientWidth;
    canvas.height = div.clientHeight;
    function resizelistener() {
        canvas.width = div.clientWidth;
        canvas.height = div.clientHeight;
    }
    window.addEventListener('resize', resizelistener);
    clearupTasks.push(() => {
        window.removeEventListener('resize', resizelistener);
    });

    canvas.onclick = () => {
        plotter.pause = !plotter.pause;
    };

    canvas.onmousemove = (ev: any) => {
        const rect = ev.target!.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        plotter.cursorLine = x;
    };

    canvas.onmouseleave = (ev) => {
        plotter.cursorLine = -1;
    };

    const clearBtn = <HTMLDivElement>$.app.querySelector(".ad-perf-btn-clear");
    clearBtn.onclick = () => { plotter.reset(); }

    setupThermometer();
}


function setupThermometer() {
    const canvas = <HTMLCanvasElement>$.app.querySelector('.ad-perf-indicator canvas')
    thermalCanvasWidth = canvas.width;
    let gl = canvas.getContext('webgl')!;
    thermometrGL = gl;
    const program = gl.createProgram()!;
    const vshader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vshader, `
    attribute vec4 position;
    attribute vec2 uv;
    varying vec2 v_uv;
    void main(void) {
        gl_Position = position;
        v_uv = uv;
    }
    `);
    gl.compileShader(vshader);
    const fshader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fshader, `
    precision mediump float;
    varying vec2 v_uv;
    uniform float thermalValue;
    uniform float pixelWidth;

    float hue2rgb(float p, float q, float t) {
        if (t < 0.0) t += 1.0;
        if (t > 1.0) t -= 1.0;
        if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
        if (t < 0.5) return q;
        if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
        return p;
    }

    vec4 hsl2rgb(vec3 hsl) {
        float h = hsl.x;
        float s = hsl.y;
        float l = hsl.z;
    
        if (s == 0.0) {
            return vec4(l); // achromatic (grey)
        }
    
        float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
        float p = 2.0 * l - q;
    
        vec3 rgb;
    
        rgb.r = hue2rgb(p, q, h + 1.0/3.0);
        rgb.g = hue2rgb(p, q, h);
        rgb.b = hue2rgb(p, q, h - 1.0/3.0);
    
        return vec4(rgb, 1.0);
    }
    


    const float PI = 3.1415926535897;

    vec4 mapcolor(float v) {
        if(v < 0.4) return hsl2rgb(vec3(0.333, 1.0, 0.5));
        float h = 0.333 - (v - 0.4) / 0.6 * 0.333;
        return hsl2rgb(vec3(h, 1.0, 0.5));
    }

    void main(void) {
        vec2 center = vec2(0.5, 0.2);
        vec2 dir = v_uv - center;
        float dist = length(dir);
        float angle = (PI - acos(dir[0]/dist))/ PI;
        if(v_uv[1] < 0.2) {
            gl_FragColor = vec4(0, 0, 0, 0);
            if(v_uv[0] > 0.3 && v_uv[0] < 0.7 &&  v_uv[1] > 0.10 && v_uv[1] < 0.14) {
                gl_FragColor = mapcolor(thermalValue);
            } else {
                gl_FragColor = vec4(0, 0, 0, 0);
            }
        } else {
            vec2  cc = clamp((vec2(dist) - vec2(0.4, 0.2))/pixelWidth, 0.0, 1.0);
            float alpha = min(1.0 - cc[0], cc[1]);
            if(angle < thermalValue) {
                gl_FragColor = vec4(mapcolor(angle).rgb, alpha);
            } else {
                gl_FragColor = vec4(0.4, 0.4, 0.4, alpha);
            }
        }
    }
    `);
    gl.compileShader(fshader);
    gl.attachShader(program, vshader);
    gl.attachShader(program, fshader);
    gl.linkProgram(program);
    gl.useProgram(program);


    ufValueLocation = gl.getUniformLocation(program, 'thermalValue')!;
    ufWidthLocation = gl.getUniformLocation(program, 'pixelWidth')!;

    const liquidVertices = new Float32Array([
        -1, -1, 0, 0,
        -1, 1, 0, 1,
        1, -1, 1, 0,
        1, 1, 1, 1, // Adjust the Y coordinate to set the liquid level
    ]);

    let vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, liquidVertices, gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
    const uv = gl.getAttribLocation(program, 'uv');
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
    // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

}
function drawThermometer(value: number) {
    if (thermometrGL) {
        thermometrGL.uniform1f(ufValueLocation, Math.min(1.4, value));
        thermometrGL.uniform1f(ufWidthLocation, 1.0 / thermalCanvasWidth);
        thermometrGL.clear(thermometrGL.COLOR_BUFFER_BIT | thermometrGL.DEPTH_BUFFER_BIT);
        thermometrGL.drawArrays(thermometrGL.TRIANGLE_STRIP, 0, 4);
    }
    const div = <HTMLDivElement>$.app.querySelector('.ad-perf-thermal-value-text');
    if (div) {
        div.innerHTML = '' + formatValue(value);
    }
}


function updateScalers(scalers: ScalerI[], selected: boolean) {
    const scalersDiv = <HTMLDivElement>$.app.querySelector('.ad-perf-scaler-list');
    scalersDiv.innerHTML = "";
    const els: string[] = [];
    const colorTag = selected ? 'background-color:hsl(128, 20%, 40%)': '';
    for (const s of scalers) {
        const p = Math.floor(100 * (s.level / s.maxLevel));
        els.push(`<div class="ad-perf-scaler-item">
                <div>${s.maxLevel}</div>
                <div>
                    <div class="ad-perf-scaler-bar">
                        <div class="ad-perf-scaler-bar-content" style="height: ${p}px; margin-top: ${100 - p}px;${colorTag}"></div>
                        <div class="ad-perf-scaler-bar-level">${s.level}</div>
                    </div>
                </div>
                <div class="ad-perf-scaler-title">${s.name}</div>
            </div>
        `);
    }
    scalersDiv.innerHTML = els.join('\n');
}