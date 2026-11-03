# Vib-Ripple image converter for PCSX2

## Requirements
* Node.js
* A prepared image file saved in JPG format with a 1:1 aspect ratio
* Downloaded and extracted the VHD template (https://drive.google.com/file/d/1mmT3kBYmCoCGIWFrFtJP4MU3ftBCULT6/view?usp=sharing)
* Latest PCSX2 nightly version and Vib-Ripple ROM

## Steps for image conversion

1. Prepare your image file: image must be in JPG format with 1:1 aspect ratio
2. In the command line run `node vibimage-cli.js <input-file> <output-file>` where the input-file is the name of your prepared JPG image, and the output-file follows this specific format: DSC0000X.JPG (with X being replaced by a number, in sequential order starting from 1.)
3. With your now-converted file, copy it to the VHD under DCIM/101MSDCF/DSC0000X.JPG.
4. Open PCSX2 controller settings, select USB Port 1, and configure it as a Mass Storage Device set to Sony MSAC-US1.
5. For Image Path, select your VHD image containing the images you added.

## Steps for adding the image to the VHD on Windows

1. Install Windows Subsystem for Linux (WSL) through terminal by running the `wsl --install` command.
2. Once installed and setup, run the command `wsl --mount "path-to-vhd" --vhd` in the Windows terminal, replacing `path-to-vhd` with the local path to the VHD on your system. You might see an error such as `The disk was attached but failed to mount`; ignore it, as we can mount the disk ourselves.
3. Start WSL by running the `wsl` command in terminal.
4. From within WSL, run the `lsblk` command. Look for your VHD in this list; the device should be between 400-500MB in size, and have a partition labeled beneath the physical disk. It will likely be named `sdd1`, `sde1`, or something of that sort.
5. If it's your first time doing this, create a new directory for the VHD to be mounted to using this command: `mkdir -p ~/vib`
6. With the directory created, mount the VHD disk using this command: `sudo mount /dev/<disk> ~/vib` where <disk> is replaced with the VHD you identified in `lsblk`.
7. When you are finished adding images, unmount the VHD with `wsl --unmount "path-to-vhd"`
