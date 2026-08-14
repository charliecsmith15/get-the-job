import express from 'express';
import { transform } from 'esbuild';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware to transpile TypeScript/TSX on the fly
// This allows us to keep the exact ESM + importmap architecture while running in a standard browser
app.use(async (req, res, next) => {
    if (req.path.endsWith('.tsx') || req.path.endsWith('.ts')) {
        try {
            const filePath = path.join(__dirname, req.path);
            const source = await fs.readFile(filePath, 'utf8');
            
            // Inject process.env.API_KEY into the frontend code at runtime
            const define = {
                'process.env.API_KEY': JSON.stringify(process.env.API_KEY || '')
            };

            const result = await transform(source, {
                loader: req.path.endsWith('.tsx') ? 'tsx' : 'ts',
                format: 'esm',
                target: 'es2020',
                define
            });
            
            res.type('application/javascript').send(result.code);
        } catch (err) {
            console.error(`Error transpiling ${req.path}:`, err);
            // Fallback to next middleware on error
            next();
        }
    } else {
        next();
    }
});

// Serve static files (index.html, etc.)
app.use(express.static(__dirname));

// SPA Fallback: Redirect all unknown routes to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`CareerNexus server listening on port ${PORT}`);
});
