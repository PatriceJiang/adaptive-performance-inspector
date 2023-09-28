export interface ScalerI {
    name: string;
    active: boolean;
    minLevel: number;
    maxLevel: number;
    level: number;
    cost: number;
}

export interface DataI {
    enabled: boolean;
    thermalValue: number;
    thermalLevel: number;
    thermalTrends: number;
    frameTime: number;
    frameTimeEMA: number;
    cpuTime: number;
    gpuTime: number;
    bottleneck: number;
    scalers: ScalerI[]
}

export type key_type = keyof DataI & string;
export type value_type<K extends key_type> = DataI[K]
