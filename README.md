![Logo](admin/idm.png)
# ioBroker.idm

[![NPM version](https://img.shields.io/npm/v/iobroker.idm.svg)](https://www.npmjs.com/package/iobroker.idm)
[![Downloads](https://img.shields.io/npm/dm/iobroker.idm.svg)](https://www.npmjs.com/package/iobroker.idm)
![Number of Installations](https://iobroker.live/badges/idm-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/idm-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.idm.png?downloads=true)](https://nodei.co/npm/iobroker.idm/)

**Tests:** ![Test and Release](https://github.com/lonestar2001/ioBroker.idm/workflows/Test%20and%20Release/badge.svg)

## idm adapter for ioBroker

Based on the work by <a href='https://beyer.app/blog/2018/10/home-assistant-integration-heatpump-idm-terra-ml-complete-hgl/'>Tom Beyer</a>

Integrate your IDM heat pump in ioBroker via the interface of myIDM.
To use this adapter in ioBroker, you need to have an account at myidm.at.

The adapter does not output live data from the heat pump. Every 5 minutes the data is loaded from the cloud. However, the heat pump only uploads the current values every 30-60 minutes.

The following heat pumps are supported/tested:
* IDM Terra SW8 HGL

The current version has the following limitations (due to missing hardware):
* only the first heat pump from your myidm account is displayed
* only one heating circuit is shown
* no support for cooling circuits/modes
* no support for solar modes
* no support for controlling your heat pump yet (work in progress)

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
    (lonestar2001) added controls for system and circuit mode
-->
### **WORK IN PROGRESS**
* (lonestar2001) changed channel structure for future compatibility

### 0.1.1 (2022-10-20)
* (lonestar2001) added missing circuit mode for manual_heating

### 0.1.0 (2022-10-18)
* (lonestar2001) added adapter translations
* (lonestar2001) added mode and state codes

### 0.0.3 (2022-10-13)
* (lonestar2001) removed code warnings
* (lonestar2001) updated adapter description

### 0.0.2 (2022-10-13)
* (lonestar2001) initial release

## License
MIT License

Copyright (c) 2022 Frank Walter <frank.walter@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.