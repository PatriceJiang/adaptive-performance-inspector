import { knockKnock } from "./utils";

const waitingLists: { (addr: string): boolean }[] = [];
export function flushWaitingConnections(addr: string) {
    for (let i = waitingLists.length - 1; i >= 0; i--) {
        const s = waitingLists[i];
        if (s(addr)) {
            waitingLists.splice(i, 1);
        }
    }
}

export function showInputLayerFor(target: HTMLDivElement) {

    const oldMask = target.querySelector('.input-layer');
    if (oldMask) {
        target.removeChild(oldMask);
    }

    const doDisplay = () => {
        target.parentNode?.appendChild(mask);
    };

    const doHide = () => {
        target.parentNode?.removeChild(mask);
    };

    const bb = target.getBoundingClientRect();
    const mask = document.createElement('div');
    mask.className = 'ad-perf-input-background';
    mask.style.width = (bb.right - bb.left) + 'px';
    mask.style.height = (bb.bottom - bb.top) + 'px';
    mask.addEventListener('click', () => { doHide(); return true; });


    const box = document.createElement('div');
    box.className = 'ad-perf-input-box';
    box.innerHTML = `
    <div class='ad-perf-input-item'>Input Device IP</div>
    <div class='ad-perf-input-item'><input /></div>
    <div class='ad-perf-input-item ad-perf-input-error-msg'></div>
    <div class='ad-perf-input-item'><button>Connect</button></div>
    `
    box.addEventListener('click', (e) => e.stopPropagation());
    const LocalStorageIPKEY = `ad-perf-input-address-recent`;
    const errMsg = <HTMLDivElement>box.querySelector('.ad-perf-input-error-msg');
    const inputBox = <HTMLInputElement>box.querySelector('input');

    const doValidate = () => {
        const val = inputBox.value;
        if (!/^\s*\d+\.\d+\.\d+\.\d+\s*$/.test(val)) {
            return false;
        }
        const rangeCheck = val.split('.').map(x => Number.parseInt(x)).reduce((p, c) => p && (c >= 0 && c <= 255), true);
        if (!rangeCheck) {
            return false;
        }
        return true;
    }

    inputBox.addEventListener('input', (e) => {
        const val = (e.target as HTMLInputElement).value;
        // TODO: cache value for electron
        console.log(`input ${val}`);
        const validFormat = doValidate();
        errMsg.innerHTML = validFormat ? '' : 'A valid IPv4 address format is: xxx.xxx.xxx.xxx, where each xxx is a number ranging from 0 to 255. For example, 192.168.1.1 is a valid IPv4 address.';
        localStorage.setItem(LocalStorageIPKEY, val);
    });
    inputBox.value = localStorage.getItem(LocalStorageIPKEY) || '';

    const connectBtn = <HTMLInputElement>box.querySelector('button');
    connectBtn.addEventListener('click', async () => {
        if (doValidate()) {
            knockKnock(inputBox.value);
            connectBtn.disabled = true;
            const ok = await waitClient(inputBox.value, 5000);
            connectBtn.disabled = false;
            if (ok) doHide();
        }
    });


    mask.appendChild(box);
    doDisplay();
}

function waitClient(addr: string, timeoutMS: number): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
        const exp = setTimeout(() => {
            waitingLists.length = 0;
            resolve(false);
        }, timeoutMS);
        waitingLists.push((testAddr: string) => {
            if (testAddr == addr) {
                clearTimeout(exp);
                resolve(true);
                return true;
            }
            return false;
        });
    })
}