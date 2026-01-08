import fs from 'fs/promises';
import path from 'path';
import { initializeImageMagick, ImageMagick, MagickFormat, ColorSpace, MagickColors, Gravity } from '@imagemagick/magick-wasm';
import exiftool from 'node-exiftool';
import { exiftoolBin } from 'dist-exiftool';

const exiftoolProcess = new exiftool.ExiftoolProcess(exiftoolBin);

async function convertImage(inputFilePath, outputFilePath, downscale = false) {
    console.log(`Converting ${inputFilePath}...`);
    
    // Read input file
    const fileBuffer = await fs.readFile(inputFilePath);
    const imageData = new Uint8Array(fileBuffer);
    const thumbnailData = new Uint8Array(fileBuffer);
    
    // Initialize ImageMagick
    const wasmPath = path.join(process.cwd(), 'node_modules', '@imagemagick', 'magick-wasm', 'magick.wasm');
    const wasmBytes = await fs.readFile(wasmPath);
    
    await initializeImageMagick(wasmBytes);
    
    // Start exiftool process
    await exiftoolProcess.open();
    
    try {
        // Process main image
        const mainImageBlob = await processMainImage(imageData, downscale);
        
        // Process thumbnail
        const thumbnailBlob = await processThumbnail(thumbnailData);
        
        // Write files temporarily
        const tempMain = path.join(process.cwd(), 'temp_main.jpg');
        const tempThumb = path.join(process.cwd(), 'temp_thumb.jpg');
        
        await fs.writeFile(tempMain, Buffer.from(await mainImageBlob.arrayBuffer()));
        await fs.writeFile(tempThumb, Buffer.from(await thumbnailBlob.arrayBuffer()));
        
        // Apply EXIF metadata using exiftool
        const finalImage = await applyExifMetadata(tempMain, tempThumb, inputFilePath);
        
        // Write output file
        await fs.writeFile(outputFilePath, finalImage);
        
        // Cleanup temp files
        await fs.unlink(tempMain).catch(() => {});
        await fs.unlink(tempThumb).catch(() => {});
        
        console.log(`Conversion complete! Output saved to: ${outputFilePath}`);
    } finally {
        await exiftoolProcess.close();
    }
}

async function processMainImage(imageData, downscale) {
    return new Promise((resolve, reject) => {
        ImageMagick.read(imageData, img => {
            if (downscale) {
                const width = Math.round(img.baseWidth / 5);
                const height = Math.round(img.baseHeight / 5);
                img.resize(width, height);
            }
            
            img.colorSpace = ColorSpace.sRGB;
            img.quality = 85;
            img.settings.setDefine("jpeg:extent", "1300kb");
            img.settings.setDefine("jpeg:sampling-factor", "4:2:2");
            
            img.write(MagickFormat.Jpeg, data => {
                const blob = new Blob([data], { type: "image/jpeg" });
                resolve(blob);
            });
        });
    });
}

async function processThumbnail(imageData) {
    return new Promise((resolve, reject) => {
        ImageMagick.read(imageData, img => {
            img.resize(160, 120);
            img.backgroundColor = MagickColors.Black;
            img.extent(160, 120, Gravity.Center);
            img.colorSpace = ColorSpace.sRGB;
            img.quality = 85;
            img.settings.setDefine("jpeg:sampling-factor", "4:2:2");
            
            img.write(MagickFormat.Jpeg, data => {
                const blob = new Blob([data], { type: "image/jpeg" });
                resolve(blob);
            });
        });
    });
}

async function applyExifMetadata(mainImagePath, thumbnailPath, sourcePath) {
    try {
        // Step 1: Copy original metadata
        await exiftoolProcess.writeMetadata(mainImagePath, {
            all: '',
            exifbyteorder: 'little-endian',
            tagsFromFile: sourcePath,
            Make: null,
            Model: null,
            DateTimeOriginal: null,
            CreateDate: null
        }, ['overwrite_original']);
        
        // Step 2: Write default metadata
        await exiftoolProcess.writeMetadata(mainImagePath, {
            wm: 'cg',
            exifbyteorder: 'little-endian',
            Make: 'Make',
            Model: 'Model',
            DateTimeOriginal: 'now',
            CreateDate: 'now',
            InteropIndex: 'R98',
            ColorSpace: 'sRGB'
        }, ['overwrite_original']);
        
        // Step 3: Strip thumbnail metadata
        await exiftoolProcess.writeMetadata(thumbnailPath, {
            all: ''
        }, ['overwrite_original']);
        
        // Step 4: Embed thumbnail
        await exiftoolProcess.writeMetadata(mainImagePath, {
            ThumbnailImage: `<=${thumbnailPath}`
        }, ['overwrite_original']);
        
        // Read final image
        return await fs.readFile(mainImagePath);
    } catch (error) {
        console.error('Error applying EXIF metadata:', error);
        throw error;
    }
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
