import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = path.join(root, 'tmp', 'pdfs');
const outputDir = path.join(root, 'output', 'pdf');
const bundlePath = path.join(tmpDir, 'job-protocol-node-verification.mjs');
const outputPath = path.join(outputDir, 'wawis-protokol-v1009-wiekszy-podpis-i-tekst.pdf');

fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, 'src', 'mobile791', 'modules', 'job-protocol-pdf.js')],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  jsx: 'automatic',
  plugins: [{
    name: 'inline-test-fonts',
    setup(build) {
      build.onResolve({ filter: /\.ttf\?url$/ }, (args) => ({ path: args.path.replace(/\?url$/, ''), namespace: 'test-font' }));
      build.onLoad({ filter: /.*/, namespace: 'test-font' }, (args) => {
        const fontPath = require.resolve(args.path, { paths: [root] });
        const base64 = fs.readFileSync(fontPath).toString('base64');
        return { contents: `export default ${JSON.stringify(`data:font/ttf;base64,${base64}`)};`, loader: 'js' };
      });
    },
  }],
});

globalThis.window = {
  btoa: globalThis.btoa || ((value) => Buffer.from(value, 'binary').toString('base64')),
  atob: globalThis.atob || ((value) => Buffer.from(value, 'base64').toString('binary')),
};

const protocol = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
const fixtureJob = {
  id: 'mock-job-protocol-v979',
  client: 'Klient Testowy Zawiercie',
  email: 'klient@example.test',
  phone: '500 600 700',
  city: 'Zawiercie',
  street: 'Testowa 12',
  location: 'Zawiercie, Testowa 12',
  status: 'Zakończone',
  completed_at: '2026-08-28T12:30:00.000Z',
  completed_by: 'worker-1',
  installation_date: '2026-08-28',
  device_model: 'JW: Rotenso Imoto 3,5 kW | JZ: Rotenso Imoto 3,5 kW',
  device_serial_number: 'JW: NIE-MOZE-BYC-W-PDF | JZ: NIE-MOZE-BYC-W-PDF',
  main_technician_id: 'worker-1',
  viewers: [{ user_id: 'worker-2' }],
  photos: [
    { id: 'jz', photo_kind: 'nameplate', device_index: 1, unit_ref: 'jz', storage_path: 'fixture/jz.jpg', upload_status: 'uploaded' },
    { id: 'jw', photo_kind: 'nameplate', device_index: 1, unit_ref: 'jw-1', storage_path: 'fixture/jw.jpg', upload_status: 'uploaded' },
    { id: 'montaz', photo_kind: '', storage_path: 'fixture/montaz.jpg', upload_status: 'uploaded' },
  ],
};
const profiles = [
  { id: 'worker-1', full_name: 'Kacper Wydmański' },
  { id: 'worker-2', full_name: 'Krystian Swat' },
];
const signedAt = new Date('2026-08-28T12:37:00.000Z');
const payment = {
  enabled: true,
  amount: '4200,00',
  kind: 'full',
  method: 'cash',
  paidDate: '2026-08-28',
};
const data = protocol.buildJobProtocolData({ job: fixtureJob, profiles, signedAt, payment });
if (JSON.stringify(data).includes('NIE-MOZE-BYC-W-PDF')) {
  throw new Error('Numer seryjny trafił do danych protokołu.');
}
const containedSignature = protocol.getContainedSignatureSize(300, 80, 236, 64);
if (Math.abs(containedSignature.width - 236) > 0.01 || Math.abs(containedSignature.height - 62.9333333333) > 0.01) {
  throw new Error(`Podpis nie zachowuje proporcji: ${containedSignature.width}x${containedSignature.height}.`);
}
const signatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAABQCAIAAAAsiN8sAAAEPUlEQVR4nO2d0W3rMAxF24eu0Ck6QufPCJkiQ+R9FDCCOLYoieSlnXM+iqKIRdnmMSVFaT7v9/sHAOj4p+4AwLuDhABikBBADBICiEFCADFICCAGCQHEICGAGCQEEIOEAGKQEEAMEgKIQUIAMUgIIAYJAcQgIYCYt5Dw++dX3QWATc4v4Z+Bi4cICdX4UncgD/SDmpy8Er4UDxuhFBkSPiZ9pgDIBocgXMLHKdnT9ExIhT4A/JE3HE3O+6dwt+vldr1kdgDASKyEW+JFC2lpn2IIRQiUcD/LMx1YaiDFEAqSNxxNE2A9EM2JCzBGlIQvTXjyIaIYdrWpmqYyEoZHQiS0J1l0Oq7LoKowLivDdZaIoQj+Eq7T6zHvQx0YGIjmyMCeAdghfE7YrEVeuWhvJ7kY7nSslIeUaBXOEo4tikTceLtpoWnXvCBFkv5pN0WRXr0JnhIKa1Gv/DnF0LI6JWdLub+/Y2MCgcPR/WxzHJTOJ0rCOu3OxFiY6MZdDagYipuE8+/Oed1pY+hSS0T5Wb6l1lZXD61i8emuz+cJx07vdr24F7Fqg72PjS6tz/3751e1n2Hp0tMv65ctfyl4ndccpf+fLt9ZP2OC6tj5wy3N7re5/3ZOEF0FcOv1zaNU9D7WK5yCg4S+JthbcMlguzADDVrazPSwV7/msV0thDI/pBKexayE7ibYW3CpY77F0OsdmoiEmDGw2c5wazMYxetaBpOoOCWhY/ZMFpCZa+dVDB3H1ZM9aTY+H0KoosW9+c1SmTZ6Suh7U7tmKSp5HBtJmKDmNO4bohloPqjcxnEJ3ZPG3mBoaKE/0ZfUq1ljoPlwXkXPJVacjYMSBg2fLFkYUTFmJFQNB3qbmmltJmhv6NCi59IB99A+EsY9jZqzasmS5vyBxgbH2pQYuB+92YfMomckzcYRCUPfH99vPC70QDFUPYm6ju063JemjfKiZyR60tgtYcJ6+lZyC+Wff/1MZ4ztlzJwYXg3lXtP5gmycVbCnFn+yw1uofJ37XRJuwj2FzcPSeYoRc+Ir419EqZt1FwHys/7na3M0T15GWgrVs0CuIVkp14QXpPGDgmTL5/k7eBmMUzeL94MdywDFzJ3qycwORKxSpj/AJNL+DKQ+17T4S4dVL9zM5Yeg58nTLjZWyFCQ9ungtolRwysye16ufV/4YJJwuQx2E4gYZ7N79Mf4zRD0Lei63a0JVQlXwWWc1c9hizhBh69UIru4agk/x5/5kR8RGvgflD0OwGNhZkK+ZdPnY/MPVFhUgrumFZHl3v/Pje+8rzrZOv7YBqOZo4Gy1Ln9Ov0BFzw+UdPp4SxH+SQ9/2ER4QhACRAJQQQQyUEEIOEAGKQEEAMEgKIQUIAMUgIIAYJAcQgIYAYJAQQg4QAYpAQQAwSAohBQgAxSAggBgkBxCAhgBgkBBCDhABikBBADBICiPkPatPCcPezQpsAAAAASUVORK5CYII=';
const doc = await protocol.buildPdfDocument({ data, signatureDataUrl });
if (doc.getNumberOfPages() !== 1) {
  throw new Error(`Typowy protokół powinien mieć jedną stronę, otrzymano: ${doc.getNumberOfPages()}.`);
}
fs.writeFileSync(outputPath, Buffer.from(doc.output('arraybuffer')));
console.log(outputPath);
