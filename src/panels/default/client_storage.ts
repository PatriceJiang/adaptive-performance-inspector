

type InstAction = 'register' | 'hello';

type InstWithPrefix = `cocos-adaptive-performance;${InstAction}!`
function buildInstruction(name: InstAction): InstWithPrefix {
    return `cocos-adaptive-performance;${name}!`;
}

export const Instructions = {
    Register: buildInstruction('register'),
    Hello: buildInstruction('hello'),
}

const StorageKey = "adaptive-perfomance-targets";
interface AddressItemIntl {
    index: number;
    addr: string;
    name: string;
    atime: number; // active time;
    ctime: number; // create time;
    info: string;
}

interface AddressItem {
    index: number;
    addr: string;
    name: string;
    info: string;
    atime: Date; // active time;
    ctime: Date; // create time;
}

function intl2pub(x: AddressItemIntl): AddressItem {
    return {
        index: x.index,
        addr: x.addr,
        name: x.name,
        info: x.info || "",
        atime: new Date(x.atime),
        ctime: new Date(x.ctime),
    };
}

function pub2intl(x: AddressItem): AddressItemIntl {
    return {
        index: x.index,
        addr: x.addr,
        name: x.name,
        info: x.info || "",
        atime: x.atime.getTime(),
        ctime: x.ctime.getTime(),
    };
}

export class AddressStorage {

    private loadAddressesIntl(): AddressItemIntl[] {
        try {
            const data = localStorage.getItem(StorageKey) || "";
            return data.split(";").map(x => JSON.parse(x) as AddressItemIntl);
        } catch (e) {
            console.error(e);
            return [];
        }
    }

    private storeAddressIntl(list: AddressItemIntl[]): void {
        const data = list.map(x => JSON.stringify(x)).join(';');
        localStorage.setItem(StorageKey, data);
    }

    get addresses(): readonly AddressItem[] {
        const intern = this.loadAddressesIntl();
        intern.sort((a, b) => b.atime - a.atime);
        return intern.map(intl2pub);
    }

    updateAddress(item: AddressItem): void {
        const intern = this.loadAddressesIntl();
        intern.forEach(x => {
            if (x.index === item.index) {
                x.atime = (new Date).getTime();
                x.addr = item.addr;
                x.name = item.name;
                x.info = item.info;
            }
        });
        this.storeAddressIntl(intern);
    }

    addAddress(name: string, addr: string, info: string): AddressItem {
        let intern = this.loadAddressesIntl();
        const index = intern.reduce((p, c) => Math.max(p, c.index), 1) + 1;
        const nowTime = (new Date).getTime();
        const last = { index, atime: nowTime, ctime: nowTime, name: name, addr, info };
        intern.push(last);
        if(intern.length > 20) {
            intern.sort((a, b) => b.atime - a.atime);
            intern = intern.slice(0, 20);
        }
        this.storeAddressIntl(intern);
        return intl2pub(last);
    }


    deleteAddress(index: number): void {
        const intern = this.loadAddressesIntl();
        const remained = intern.filter(x => x.index != index);
        this.storeAddressIntl(remained);
    }

    findAddr(addr: string): AddressItem | null {
        const result = this.addresses.filter(x => x.addr === addr);
        if (result.length === 0) return null;
        return result[0];
    }
}