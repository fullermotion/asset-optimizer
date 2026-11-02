// Encodes one JPEG XL image with libjxl's WebAssembly build, off the Electron main thread.
import { parentPort, workerData } from "node:worker_threads";
import encode, { init } from "@jsquash/jxl/encode.js";

const { wasmModule, data, width, height, options } = workerData;
await init(wasmModule);
const output = await encode({ data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height }, options);
parentPort.postMessage(output, [output]);
