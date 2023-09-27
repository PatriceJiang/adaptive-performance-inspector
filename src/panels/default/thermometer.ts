import { formatValue } from "./utils";

export class Thermometer {
    canvas: HTMLCanvasElement;
    textDiv: HTMLDivElement;
    constructor(canvas: HTMLCanvasElement, textDiv: HTMLDivElement) {
        this.canvas = canvas;
        this.textDiv = textDiv;
    }

    setup() {
        const canvas = this.canvas;
        const gl = canvas.getContext('webgl')!;
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


        const ufValueLocation = gl.getUniformLocation(program, 'thermalValue')!;
        const ufWidthLocation = gl.getUniformLocation(program, 'pixelWidth')!;

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


        return (value: number): void => {
            if (gl) {
                gl.uniform1f(ufValueLocation, Math.min(1.4, value));
                gl.uniform1f(ufWidthLocation, 1.0 / canvas.width);
                gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
            if (this.textDiv) {
                this.textDiv.innerHTML = '' + formatValue(value);
            }
        };
    }
}