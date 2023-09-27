const net = require('net');
const os = require('os');

export function formatValue(value: number, n: number = 3): string | number {
    return Math.abs(value - Math.floor(value)) < 1e-5 ? Math.round(value) : value.toFixed(n);
}



export function find_port(startPort: number, endPort: number = startPort + 10): Promise<number> {
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

export function server_bind(server: any, port: number): Promise<void> {
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

