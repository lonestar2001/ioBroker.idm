'use strict';

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const { createHash } = require('crypto');
const axios = require('axios').default;
const https = require('https');

class Idm extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'idm',
        });

        this.idmApiClient = null;
        this.reloadTimeout = null;
        this.debugData = null;
        this.token = null;
        this.id = null;

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {

        // Code based on the work of Tom Beyer
        // https://beyer.app/blog/2018/10/home-assistant-integration-heatpump-idm-terra-ml-complete-hgl/

        // Reset the connection indicator during startup
        this.setState('info.connection', false, true);

        if (!this.config.clientLogin){
            this.log.error('E-Mail is empty. Please check instance configuration');
            return;
        }

        if (!this.config.clientPassword){
            this.log.error('Password is empty. Please check instance configuration');
            return;
        }

        this.idmApiClient = axios.create({
            baseURL: 'https://www.myidm.at',
            timeout: 5000,
            headers: {
                'User-Agent': 'IDM App (iOS)',
            },
            responseType: 'json',
            responseEncoding: 'utf8',
            httpsAgent: new https.Agent({
                rejectUnauthorized: false,
            })
        });

        this.doLogin();

        // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
        // this.subscribeStates('testVariable');
        // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
        // this.subscribeStates('lights.*');
        // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
        // this.subscribeStates('*');

        /*
            setState examples
            you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
        */

    }

    doConvertToFloat(value){
        return parseFloat(value); //parseFloat(value.replace('°C','').replace('kWh','').trim());
    }

    // Todo:
    // read installations[0]['config'] for supported fields to enable a more generic adapter (only on request)

    async doLogin(){

        // Encode password for server
        let passwordHashed = '';
        try {

            const hash = createHash('sha1');
            hash.update(this.config.clientPassword);
            passwordHashed = hash.digest('hex');

        } catch (err) {

            this.log.error(err);
            this.setState('info.connection', false, true);

        }

        try {

            const payload = new URLSearchParams();
            payload.append('username',this.config.clientLogin);
            payload.append('password',passwordHashed);

            // @ts-ignore
            const installations = await this.idmApiClient.post('/api/user/login',payload);

            if (installations.status == 200){

                if (!this.debugData){
                    // debug all devices found in installations
                    installations.data['installations'].forEach((item,idx) => {
                        this.log.debug('Config-Data '+idx+': '+JSON.stringify(item));
                    });
                }

                this.log.debug('Received session token');

                await this.setStateAsync('info.installationName',installations.data['installations'][0]['name'],true);
                await this.setStateAsync('info.installationId',parseInt(installations.data['installations'][0]['id']),true);
                this.token = installations.data['token'];
                this.id = installations.data['installations'][0]['id'];
                // load device data, currently only first device supported
                this.getDeviceData();
            } else {
                this.log.warn('Server is returning: '+installations.status);
                this.setState('info.connection', false, true);
            }

        } catch (err) {

            this.log.error(err);
            // IDM Server does not return any other error but 404, so verfication if user or password is incorrect not possible
            this.log.info('Please check if your e-mail and password are correct!');
            this.setState('info.connection', false, true);

        } finally {

            // clear timeout if login triggered manually in between
            if (this.reloadTimeout)
                this.clearTimeout(this.reloadTimeout);

            // Try again later or refresh data
            this.reloadTimeout = this.setTimeout(() => {
                this.reloadTimeout = null;
                this.doLogin();
            }, 5*60*1000); // every 5 minutes
            this.log.debug('reloadTimeout triggered with id:'+this.reloadTimeout);

        }

    }

    async getDeviceData(){

        try {
            const payload = new URLSearchParams();
            payload.append('token',this.token);
            payload.append('installation',this.id);

            // @ts-ignore
            const deviceValues = await this.idmApiClient.post('/api/installation/values',payload);

            if (deviceValues.status == 200){

                this.log.debug('Received device data');

                if (!this.debugData){
                    // debug all circuits found in current heat pump
                    this.log.debug('Device-Data: '+JSON.stringify(deviceValues.data));
                    deviceValues.data['circuits'].forEach((item,idx) => {
                        this.log.debug('Circuit-Data '+idx+': '+JSON.stringify(item));
                    });

                    this.debugData = true;
                }

                this.setState('info.connection', true, true);
                this.subscribeStates('*setMode*');

                const convertState = {
                    'icon_12': 'off',           // system & circuit
                    'icon_3': 'heating_water',  // system
                    'icon_5': 'heating'         // circuit & (by mistake also system sometimes)
                };
                const convertMode = {
                    'icon_12': 'off',           // system & circuit
                    'icon_24': 'time_program',  // circuit
                    'icon_21': 'normal',        // circuit
                    'icon_11': 'eco',           // circuit
                    'icon_10': 'manual_heating',// circuit
                    'icon_1': 'manual_cooling', // circuit
                    'icon_auto': 'automatic',   // system
                    'icon_3': 'hot_water'       // system
                };

                // updating water values
                await this.setStateAsync('system.values.tempHygienic',this.doConvertToFloat(deviceValues.data['temp_hygienic']),true);
                await this.setStateAsync('system.values.tempWater',this.doConvertToFloat(deviceValues.data['temp_water']),true);

                // updating system values
                await this.setStateAsync('system.values.mode',convertMode[deviceValues.data['mode']],true);
                this.log.debug('Current system mode: '+deviceValues.data['mode']);
                await this.setStateAsync('system.values.state',convertState[deviceValues.data['state']],true);
                this.log.debug('Current system state: '+deviceValues.data['state']);
                await this.setStateAsync('system.values.sumHeat',this.doConvertToFloat(deviceValues.data['sum_heat']),true);
                await this.setStateAsync('system.values.tempOutside',this.doConvertToFloat(deviceValues.data['temp_outside']),true);
                await this.setStateAsync('system.values.error',deviceValues.data['error'],true);
                await this.setStateAsync('system.values.errors',JSON.stringify(deviceValues.data['errors']),true);
                this.log.debug('Current errors: '+JSON.stringify(deviceValues.data['errors']));

                // updating circuit values
                await this.setStateAsync('circuits.0.values.mode',convertMode[deviceValues.data['circuits'][0]['mode']],true);
                this.log.debug('Current circuit mode: '+deviceValues.data['circuits'][0]['mode']);
                await this.setStateAsync('circuits.0.values.state',convertState[deviceValues.data['circuits'][0]['state']],true);
                this.log.debug('Current circuit state: '+deviceValues.data['circuits'][0]['state']);
                await this.setStateAsync('circuits.0.values.tempHeat',this.doConvertToFloat(deviceValues.data['temp_heat']),true);
                await this.setStateAsync('circuits.0.values.tempParamsNormal',this.doConvertToFloat(deviceValues.data['circuits'][0]['temp_params_normal']['value']),true);
                await this.setStateAsync('circuits.0.values.tempParamsEco',this.doConvertToFloat(deviceValues.data['circuits'][0]['temp_params_eco']['value']),true);
                await this.setStateAsync('circuits.0.values.tempForerun',this.doConvertToFloat(deviceValues.data['circuits'][0]['temp_forerun']),true);
                await this.setStateAsync('circuits.0.values.tempForerunActual',this.doConvertToFloat(deviceValues.data['circuits'][0]['temp_forerun_actual']),true);

            } else {
                this.log.warn('Server is returning: '+deviceValues.status);
            }

        } catch (err) {

            this.log.error(err);

        }

    }

    // Executing system or circuit command
    async doExecuteCommand(id,command,cmd,val,circuit){

        try {
            const payload = new URLSearchParams();
            payload.append('token',this.token);
            payload.append('installation',this.id);
            payload.append('command',cmd);
            // @ts-ignore
            payload.append('value',val);

            if (circuit){
                payload.append('circuit',circuit);
            }

            if (!this.token)
                this.log.error('Cmd: no token set');
            if (!this.id)
                this.log.error('Cmd: no installation id set');
            if (!cmd)
                this.log.error('Cmd: no command set');
            if (val === null)
                this.log.error('Cmd: no value set');

            // @ts-ignore
            const response = await this.idmApiClient.post('/api/installation/command',payload);

            if (response.status == 200){

                this.log.debug('Received command <'+command+'>: '+cmd+', value: '+val+', circuit: '+circuit);
                this.log.debug('Return message: '+JSON.stringify(response.data));

                if (response.data['status']){
                    this.setState(id,true,true);
                } else {
                    this.log.warn('Command <'+command+'> not acknowledged!');
                }

            } else {

                this.log.warn('Server is returning: '+response.status);
                this.log.debug('command: '+command);
                this.log.debug('value: '+val);
                this.log.debug('circuit: '+circuit);

            }

        } catch (err) {

            this.log.error(err);

        }

    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);
            if (this.reloadTimeout){
                this.log.debug('reload Timeout: UNLOAD');
                this.clearTimeout(this.reloadTimeout);
            }

            callback();
        } catch (e) {
            callback();
        }
    }

    /**
    * Is called if a subscribed object changes
    * @param {string} id
    * @param {ioBroker.Object | null | undefined} obj
    */
    onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {

        // Command for setting circuit modes:
        // www.myidm.at /api/installation/command
        // token: token
        // installation: id
        // command: circuit_mode
        // value: 0 (off) 1 (time_program) 2 (normal) 3 (eco) 4 (manual_heating) 5 (manual_cooling)
        // circuit: 0

        // Command for setting system modes:
        // www.myidm.at /api/installation/command
        // token: token
        // installation: id
        // command: system_mode
        // value: 0 (off) 1 (automatic) 2 (hot_water) 3 (hot_water_once)
        // hot_water_once will never be displayed as mode (more like a button). hot_water_once activates state "hot_water". mode changes (back) to "automatic"

        if (id && state && !state.ack) {

            const matches = id.match(new RegExp(this.namespace + '(.system)?(.circuits.([0-9]+))?.command.([a-zA-Z]+)'));
            if (matches) {
                const circuit = matches[3];
                const command = matches[4];

                let cmd = null;
                let val = null;

                if (circuit){

                    // Circuit Commands
                    cmd = 'circuit_mode';
                    switch (command) {
                        case 'setModeOff':
                            val = 0;
                            break;
                        case 'setModeTimeProgram':
                            val = 1;
                            break;
                        case 'setModeNormal':
                            val = 2;
                            break;
                        case 'setModeEco':
                            val = 3;
                            break;
                        case 'setModeManualHeating':
                            val = 4;
                            break;
                        case 'setModeManualCooling':
                            val = 5;
                            break;
                    }

                } else {

                    // System Commands
                    cmd = 'system_mode';
                    switch (command) {
                        case 'setModeOff':
                            val = 0;
                            break;
                        case 'setModeAutomatic':
                            val = 1;
                            break;
                        case 'setModeHotWater':
                            val = 2;
                            break;
                        case 'setModeHotWaterOnce':
                            val = 3;
                            break;
                    }

                }

                // Send correct command
                this.doExecuteCommand(id,command,cmd,val,circuit);

            }
        }
        if (state) {
            // The state was changed
            this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.debug(`state ${id} deleted`);
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    //     if (typeof obj === 'object' && obj.message) {
    //         if (obj.command === 'send') {
    //             // e.g. send email or pushover or whatever
    //             this.log.info('send command');

    //             // Send response in callback if required
    //             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    //         }
    //     }
    // }

}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Idm(options);
} else {
    // otherwise start the instance directly
    new Idm();
}