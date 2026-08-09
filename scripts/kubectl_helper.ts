import { spawn } from 'child_process';
import EventEmitter from 'events';

let child: ReturnType<typeof spawn>;
let isReady = false;
const readyEmitter = new EventEmitter();
export function start() {
    child = spawn(`kubectl port-forward -n ${process.env.PRODNS} deployment/postgres-deployment 5555:5432`, {
        shell: true,
    });
    child.stdout!.on('data', (data) => {
        if (data.toString().includes('Forwarding from')) {
            isReady = true;
            readyEmitter.emit('ready');
        }
        process.stdout.write(data.toString());
    });
}

export async function ready() {
    if (!child) throw new Error('kubectl port-forward not started');
    else if (isReady) return;
    return new Promise<void>((resolve) => {
        readyEmitter.once('ready', () => {
            resolve();
        });
    });
}

export function stop() {
    if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', child.pid!.toString(), '/f', '/t']);
    } else {
        child.kill();
    }
}
