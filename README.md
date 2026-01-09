# Vib-Ripple image converter for PCSX2

## Requirements
* Node.js
* A prepared image file saved in JPG format with a 1:1 aspect ratio
* Downloaded and extracted the VHD template
* Latest PCSX2 nightly version and Vib-Ripple ROM

## Steps for image conversion

1. Prepare your image file: image must be in JPG format with 1:1 aspect ratio
2. In the command line run "node vibimage-cli.js <input-file> <output-file>" where the input-file is the name of your prepared JPG image, and the output-file follows this specific format: DSC0000X.JPG (with X being replaced by a number, in sequential order starting from 1.)
3. With your now-converted file, place it in the VHD under DCIM/101MSDCF/DSC0000X.JPG.
4. Open PCSX2 controller settings, select USB Port 1, and configure it as a Mass Storage Device set to Sony MSAC-US1.
5. For Image Path, select your VHD image containing the images you added.