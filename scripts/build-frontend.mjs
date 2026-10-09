import { build } from 'vite';

// Local .env files set NODE_ENV=development for the API. Keep frontend builds
// deterministic and production-optimized regardless of that backend setting.
process.env.NODE_ENV = 'production';
await build({ mode: 'production' });
