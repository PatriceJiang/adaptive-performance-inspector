import { knockKnock } from "./utils";

export function showInputLayerFor(target: HTMLDivElement) {

    const oldMask = target.querySelector('.input-layer');
    if (oldMask) {
        target.removeChild(oldMask);
    }

    const bb = target.getBoundingClientRect();
    const mask = document.createElement('div');
    mask.className = 'ad-perf-input-background';
    mask.style.width = (bb.right - bb.left) + 'px';
    mask.style.height = (bb.bottom - bb.top) + 'px';
    mask.addEventListener('click', () => { mask.parentNode?.removeChild(mask); return true; });


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
    connectBtn.addEventListener('click', () => {
        if (doValidate()) {
            knockKnock(inputBox.value);
        }
    });


    mask.appendChild(box);

    target.parentNode?.appendChild(mask);
}