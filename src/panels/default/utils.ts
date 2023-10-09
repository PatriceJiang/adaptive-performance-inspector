const net = require('net');
const os = require('os');
import * as dgram from 'dgram';
import { Instructions } from "./client_storage";

export function formatValue(value?: number, n: number = 3): string | number {
    if (value === undefined || value === null) return 0;
    return Math.abs(value - Math.floor(value)) < 1e-5 ? Math.round(value) : value.toFixed(n);
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

function bindServerPort(server: any, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        server.bind(port, '0.0.0.0', (err: Error) => {
            if (err) { reject(err); return; }
            resolve();
        })
    })
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

export function getBroadcastAddress() {
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

let server: dgram.Socket | null = null;
export async function getUDPServer() {
    if (server) return server;
    const port = await find_port(4000, 5000);
    server = dgram.createSocket('udp4');
    server.on('error', (error: Error) => {
        console.error('Udp Server Error');
        console.error(error);
    });
    await bindServerPort(server, port);
    return server;
}

export function knockKnock(addr: string, port: number = 9933) {
    const encoder = new TextEncoder();
    const msgContent = encoder.encode(Instructions.Hello);
    const buffer = Buffer.from(msgContent.buffer);
    if (!server) return;
    server.send(buffer, port, addr, (err: Error | null, bytes: number): void => {
        if (err) {
            console.error(err);
        }
    });
}


const MINUTE_SECONDS = 60;
const HOUR_SECONDS = MINUTE_SECONDS * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;
const WEEK_SECONDS = 7 * DAY_SECONDS;
const MONTH_SECONDS = 30 * DAY_SECONDS;
const YEAR_SECONDS = 365 * DAY_SECONDS;
export function timeAgo(d: Date): string {
    const secondsAgo = ((new Date).getTime() - d.getTime()) / 1000;
    if (secondsAgo > YEAR_SECONDS) {
        const years = Math.floor(secondsAgo / YEAR_SECONDS);
        return `${years} ${years === 1 ? 'year' : 'years'}`;
    }

    if (secondsAgo > MONTH_SECONDS) {
        const months = Math.floor(secondsAgo / MONTH_SECONDS);
        return `${months} ${months === 1 ? 'month' : 'months'}`;
    }

    if (secondsAgo > WEEK_SECONDS) {
        const weeks = Math.floor(secondsAgo / WEEK_SECONDS);
        return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
    }

    if (secondsAgo > DAY_SECONDS) {
        const days = Math.floor(secondsAgo / DAY_SECONDS);
        return `${days} ${days === 1 ? 'day' : 'days'}`;
    }

    if (secondsAgo > HOUR_SECONDS) {
        const hours = Math.floor(secondsAgo / HOUR_SECONDS);
        return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }

    if (secondsAgo > MINUTE_SECONDS) {
        const minutes = Math.floor(secondsAgo / MINUTE_SECONDS);
        return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    }

    const seconds = Math.floor(secondsAgo);
    return `${seconds} seconds`;
}