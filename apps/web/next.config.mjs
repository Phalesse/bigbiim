import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');

export default {
  output: 'standalone', // image Docker minimale
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { outputFileTracingRoot: root },
};
