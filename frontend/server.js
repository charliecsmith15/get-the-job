import express from 'express';
import { transform } from 'esbuild';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware to transpile TypeScript/TSX on the fly
app.use(async (req, res, next) => {
    let filePath = path.join(__dirname, req.path);
    let loader = null;

    if (req.path.endsWith('.tsx')) {
        loader = 'tsx';
    } else if (req.path.endsWith('.ts')) {
        loader = 'ts';
    } else {
        // Resolve extension-less imports (e.g. ./App → ./App.tsx)
        for (const [ext, l] of [['.tsx', 'tsx'], ['.ts', 'ts']]) {
            try {
                await fs.access(filePath + ext);
                filePath = filePath + ext;
                loader = l;
                break;
            } catch {}
        }
    }

    if (!loader) return next();

    try {
        const source = await fs.readFile(filePath, 'utf8');
        const define = {
            'process.env.API_KEY': JSON.stringify(process.env.API_KEY || '')
        };
        const result = await transform(source, {
            loader,
            format: 'esm',
            target: 'es2020',
            define
        });
        res.type('application/javascript').send(result.code);
    } catch (err) {
        console.error(`Error transpiling ${req.path}:`, err);
        next();
    }
});

// Serve static files (index.html, etc.)
app.use(express.static(__dirname));

// SPA Fallback: Redirect all unknown routes to index.html
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`CareerNexus server listening on port ${PORT}`);
});
