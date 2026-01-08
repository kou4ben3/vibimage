import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { initializeImageMagick, ImageMagick, MagickFormat, ColorSpace, MagickColors, Gravity } from '@imagemagick/magick-wasm';
import exiftoolBin from 'dist-exiftool';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

let magickInitPromise;

function runExiftool(args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(exiftoolBin, args, { windowsHide: true });
        let stderr = '';
        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(stderr.trim() || `exiftool exited with code ${code}`));
        });
    });
}

function magickReadToJpegBytes(inputBytes, mutator) {
    return new Promise((resolve, reject) => {
        try {
            ImageMagick.read(inputBytes, (img) => {
                try {
                    mutator(img);
                    img.write(MagickFormat.Jpeg, (bytes) => resolve(bytes));
                } catch (err) {
                    reject(err);
                }
            });
        } catch (err) {
            reject(err);
        }
    });
}

async function writeExif(imageBytes, secondFile, tags, returnUrl, ctx) {
    const inputPath = path.join(ctx.tempDir, 'convert.jpg');
    const secondPath = path.join(ctx.tempDir, 'source_secondFile.jpg');
    const outputPath = path.join(ctx.tempDir, `out_${ctx.step++}.jpg`);

    await fs.writeFile(inputPath, Buffer.from(imageBytes));

    let hasSecondFile = false;
    if (typeof secondFile === 'string') {
        hasSecondFile = true;
        await fs.copyFile(secondFile, secondPath);
    } else if (secondFile instanceof Uint8Array || Buffer.isBuffer(secondFile)) {
        hasSecondFile = true;
        await fs.writeFile(secondPath, Buffer.from(secondFile));
    }

    const replacedTags = tags.map((t) => {
        let v = t;
        if (ctx.sourcePath) {
            v = v.replace('/source_convert.jpg', ctx.sourcePath);
        }
        if (hasSecondFile) {
            v = v.replace('/source_secondFile.jpg', secondPath);
        }
        return v;
    });

    const args = ['-m', ...replacedTags, inputPath, '-o', outputPath];
    await runExiftool(args);

    if (returnUrl === true) {
        return outputPath;
    }
    return await fs.readFile(outputPath);
}

async function doOutputImage(e, n, options) {
    const ctx = {
        tempDir: await fs.mkdtemp(path.join(os.tmpdir(), 'vibimage-')),
        step: 0,
        sourcePath: options?.sourcePath,
    };

    try {
        // Main image (matches browser logic)
        const mainJpegBytes = await magickReadToJpegBytes(e, (a) => {
            if (options?.downscale === true) {
                const w = Math.round(a.baseWidth / 5);
                const h = Math.round(a.baseHeight / 5);
                a.resize(w, h);
            }
            a.colorSpace = ColorSpace.sRGB;
            a.settings.setDefine('jpeg:sampling-factor', '4:2:2');
            a.settings.setDefine('jpeg:extent', '1300kb');
        });

        // EXIF step 1 (copy tags from original source)
        let args = [
            '-all=',
            '-exifbyteorder=little-endian',
            '-tagsFromFile=/source_convert.jpg',
            '-Make',
            '-Model',
            '-DateTimeOriginal',
            '-CreateDate',
        ];
        const step1 = await writeExif(mainJpegBytes, null, args, false, ctx);

        // EXIF step 2 (write defaults)
        args = [
            '-wm',
            'cg',
            '-exifbyteorder=little-endian',
            '-Make=Make',
            '-Model=Model',
            '-DateTimeOriginal=now',
            '-CreateDate=now',
            '-InteropIndex=R98',
            '-ColorSpace=sRGB',
            '-ExifImageHeight<ImageHeight',
            '-ExifImageWidth<ImageWidth',
        ];
        const step2Main = await writeExif(step1, null, args, false, ctx);

        // Thumbnail image
        const thumbJpegBytes = await magickReadToJpegBytes(n, (img) => {
            img.resize(160, 120);
            img.backgroundColor = MagickColors.Black;
            img.extent(160, 120, Gravity.Center);
            img.colorSpace = ColorSpace.sRGB;
            img.settings.setDefine('jpeg:sampling-factor', '4:2:2');
        });

        // Thumbnail EXIF strip
        const strippedThumb = await writeExif(thumbJpegBytes, null, ['-all='], false, ctx);

        // Embed thumbnail into main
        const final = await writeExif(step2Main, strippedThumb, ['-ThumbnailImage<=/source_secondFile.jpg'], false, ctx);
        return final;
    } finally {
        await fs.rm(ctx.tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

async function convertImage(inputFilePath, outputFilePath, downscale = false) {
    console.log(`Converting ${inputFilePath}...`);
    
    // Read input file
    const fileBuffer = await fs.readFile(inputFilePath);
    const imageData = new Uint8Array(fileBuffer);
    const thumbnailData = new Uint8Array(fileBuffer);
    
    if (!magickInitPromise) {
        magickInitPromise = (async () => {
            // Initialize ImageMagick (resolve from installed package)
            // Note: package.json isn't exported, so resolve the entrypoint and derive the dist folder.
            const magickEntryPath = require.resolve('@imagemagick/magick-wasm');
            const magickDistDir = path.dirname(magickEntryPath);
            const wasmPath = path.join(magickDistDir, 'magick.wasm');
            const wasmBytes = await fs.readFile(wasmPath);
            await initializeImageMagick(wasmBytes);
        })();
    }
    await magickInitPromise;

    const finalImage = await doOutputImage(imageData, thumbnailData, {
        downscale,
        sourcePath: inputFilePath,
    });

    await fs.writeFile(outputFilePath, finalImage);
    console.log(`Conversion complete! Output saved to: ${outputFilePath}`);
}

// CLI entry point
const args = process.argv.slice(2);

if (args.length < 1) {
    console.log('Usage: node vibimage-cli.js <input-file> [output-file] [--downscale]');
    console.log('Example: node vibimage-cli.js input.jpg output.jpg --downscale');
    process.exit(1);
}

const inputFile = args[0];
const outputFile = args[1] || `converted_${path.basename(inputFile)}`;
const downscale = args.includes('--downscale');

convertImage(inputFile, outputFile, downscale)
    .catch(error => {
        console.error('Conversion failed:', error);
        process.exit(1);
    });
