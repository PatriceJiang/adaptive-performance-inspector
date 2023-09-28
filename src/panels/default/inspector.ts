const dgram = require('dgram');

import { ScalerI, DataI, key_type } from "./types";
import { DataPlot } from './plotter';
import { find_port, server_bind, formatValue, getBroadcastAddress } from "./utils";
import { Thermometer } from "./thermometer";

const $clearupTasks: { (): void }[] = [];
const $persistFrameTask: { (): void }[] = [];

let plotter: DataPlot | null = null;


export async function setupUDPServer($: any) {
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
            frameHandleData(data, $);
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

    $persistFrameTask.push(() => framePlotData($));
    $clearupTasks.push(() => {
        clearInterval(broadcastTask);
        server.close();
    });
}



let moduleListHTML: HTMLUListElement | null = null;
const ModuleColorMap: { [k in keyof DataI]: string } = {} as any;

const ModuleNameMap: { [k in keyof Partial<DataI>]: string } = {
    'frameTime': 'Frame Time',
    'cpuTime': 'CPU Time',
    'gpuTime': 'GPU Time',
    'thermalValue': 'Thermal Value',
    'thermalTrends': 'Thermal Trends',
    'thermalLevel': 'Thermal Level',
};

const ModuleUnitMap: { [k in keyof Partial<DataI>]: string | string[] } = {
    'frameTime': 'ms',
    'cpuTime': 'ms',
    'gpuTime': 'ms',
    'thermalLevel': ['L0', 'L1', 'L2', 'L3'],
    'thermalTrends': ['FAST_DECREASE', 'DECREASE', 'STABLE', 'INCREASE', 'FAST_INCREASE'],
};

function processEachModule(fn: (name: key_type, title: string) => void) {
    Object.keys(ModuleNameMap).forEach(x => {
        fn(x as key_type, (ModuleNameMap as any)[x]);
    });
}

function frameHandleData(data: DataI, $: any) {
    if (!plotter) return;
    if (!moduleListHTML) {
        moduleListHTML = <HTMLUListElement>$.app.querySelector('.ad-perf-data-modules-list ul');
        lazySetupModuleList(moduleListHTML);
    }
    if (!plotter.pause) {
        plotter.push(data);
        const bottleneck = <HTMLDivElement>$.app.querySelector('.ad-perf-bottleneck-value');
        const list = ['None', 'CPU', 'GPU', 'CPU & GPU'];
        bottleneck.innerHTML = list[data.bottleneck] || 'unknown';
        bottleneck.style.backgroundColor = data.bottleneck === 0 ? 'green' : 'red';
    }
    requestAnimationFrame(framePlotData);
}

function framePlotData($: any) {
    if (!plotter || !plotter.dirty) return;
    plotter.clear();
    const plotLine = (field: key_type, bottomRange: number, topRange: number, expandBottom: boolean = false, expandTop: boolean = false): void => {
        plotter?.drawWithFilter(ModuleColorMap[field], field, ModuleNameMap[field] || field, bottomRange, topRange, (d) => <number>d[field], expandBottom, expandTop);
    }
    plotLine('cpuTime', 0, 20, false, true);
    plotLine('gpuTime', 0, 20,);
    plotLine('thermalValue', 10, -10, true, true);
    plotLine('thermalTrends', 0, 4,);
    plotLine('thermalLevel', 0, 4,);
    plotLine('frameTime', 0, 20, false, true);
    const hasCursor = plotter.drawCursorLine();
    if (hasCursor) {
        let x = plotter.cursorLine + 8;
        const p = (delta: number, i = 0) => () => 40 + delta * i++;
        const pp = p(25);
        const lb = (k: key_type, title: string) => {
            const v = <number>plotter?.sample(k);
            plotter?.drawLabel(x, pp(), title + ": " + formatValue(v, 2), ModuleColorMap[k]);
        }
        processEachModule(lb);
    }
    plotter.drawPauseState();
    const scalers = plotter.sample('scalers');
    frameUpdateScalers($, scalers || [], hasCursor);
    frameUpdateStatist($);

    plotter.dirty = false;
}

export function setupHTMLContent($: any) {
    plotter = new DataPlot('#ad-perf-chart', $);

    const canvasContainer = <HTMLDivElement>$.app.querySelector(".ad-perf-data-paint");
    const canvas = <HTMLCanvasElement>canvasContainer.querySelector('canvas');
    canvas.width = canvasContainer.clientWidth;
    canvas.height = canvasContainer.clientHeight;
    function resizelistener() {
        canvas.width = canvasContainer.clientWidth;
        canvas.height = canvasContainer.clientHeight;
    }
    window.addEventListener('resize', resizelistener);
    $clearupTasks.push(() => {
        window.removeEventListener('resize', resizelistener);
        if (plotter) plotter.dirty = true;
    });

    canvas.onclick = () => {
        if (plotter) {
            plotter.pause = !plotter.pause;
            plotter.dirty = true;
        }
    };

    canvas.onmousemove = (ev: any) => {
        if (plotter) {
            const rect = ev.target!.getBoundingClientRect();
            const x = ev.clientX - rect.left;
            plotter.cursorLine = x;
            plotter.dirty = true;
        }
    };

    canvas.onmouseleave = (ev) => {
        if (plotter) {
            plotter.cursorLine = -1;
            plotter.dirty = true;
        }
    };

    const clearBtn = <HTMLDivElement>$.app.querySelector(".ad-perf-btn-clear");
    clearBtn.onclick = () => { plotter?.reset(); }

    setupThermometer($);
}

function lazySetupModuleList(unorderedList: HTMLUListElement) {
    let genColorByRange = (steps: number, i = 0) => () => `hsla(${Math.round(steps * i++)}, 80%, 60%, 0.9)`;
    const buildListItem = (key: key_type, title: string, color: string) => {
        const span = document.createElement('span');
        span.classList.add('ad-perf-module-color');
        span.style.backgroundColor = color;
        const li = document.createElement('li');
        li.appendChild(span);
        const tt = document.createTextNode(title);
        li.appendChild(tt);

        li.addEventListener('mouseenter', () => plotter?.active(key));
        li.addEventListener('mouseleave', () => plotter?.deactive(key));
        return li;
    };

    const assignColor = genColorByRange(360 / 6);
    unorderedList!.innerHTML = "";
    ModuleColorMap.cpuTime = assignColor();
    ModuleColorMap.gpuTime = assignColor();
    ModuleColorMap.frameTime = assignColor();
    ModuleColorMap.thermalLevel = assignColor();
    ModuleColorMap.thermalValue = assignColor();
    ModuleColorMap.thermalTrends = assignColor();
    const appendItem = (key: key_type, title: string) => {
        unorderedList?.appendChild(buildListItem(key, title, ModuleColorMap[key]))
    };
    processEachModule(appendItem);
}

function setupThermometer($: any) {
    const canvas = <HTMLCanvasElement>$.app.querySelector('.ad-perf-indicator canvas')
    const textDiv = <HTMLDivElement>$.app.querySelector('.ad-perf-thermal-value-text');
    const thermometer = new Thermometer(canvas, textDiv);
    const frameFn = thermometer.setup();
    $persistFrameTask.push(() => {
        if (plotter) {
            const d = plotter.data.last();
            if (d) {
                frameFn(d.thermalValue);
            }
        }
    });
}


function frameUpdateScalers($: any, scalers: ScalerI[], selected: boolean) {
    const scalersDiv = <HTMLDivElement>$.app.querySelector('.ad-perf-scaler-list');
    scalersDiv.innerHTML = "";
    const els: string[] = [];
    const colorTag = selected ? 'background-color:hsl(128, 20%, 40%)' : '';
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


function frameUpdateStatist($: any) {
    const block = <HTMLDivElement>$.app.querySelector('.ad-perf-latest-data-block');
    const d = plotter?.data;
    if (!d) return;
    const sections: string[] = [];
    const processItem = (key: key_type, title: string) => {
        const s = d.mapAll(x => x[key] as number).reduce((p, c) => p + c, 0);
        const avg = s / d.length;
        let unit = ModuleUnitMap[key];
        unit = unit === undefined ? `${formatValue(avg)}` : (unit instanceof Array ? unit[Math.round(avg)] : `${formatValue(avg)} ${unit}`);
        sections.push(`${title}: ${unit} <br/>`)
    };
    processEachModule(processItem);
    block.innerHTML = sections.join('\n');
}


export function tearDown() {
    $clearupTasks.forEach(x => x());
    $clearupTasks.length = 0;
}


function mainLoop() {
    $persistFrameTask.forEach(t => t());
    requestAnimationFrame(mainLoop);
}

mainLoop();