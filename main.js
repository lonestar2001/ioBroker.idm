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
    // Command for setting circuit modes:
    // www.myidm.at /api/installation/command
    // token: token
    // installation: id
    // command: circuit_mode
    // value: 0 (off) 1 (time_program) 2 (normal) 3 (eco) 4 (manual_heating) 5 (manual_cooling)
    // circuit: 0

    // Command for setting system modes:

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
                this.log.debug('Successfully received session token');

                await this.setStateAsync('info.installationName',installations.data['installations'][0]['name'],true);
                await this.setStateAsync('info.installationId',parseInt(installations.data['installations'][0]['id']),true);

                // load device data, currently only first device supported
                this.getDeviceData(installations.data['token'],installations.data['installations'][0]['id']);
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

    async getDeviceData(token, id){

        try {
            const payload = new URLSearchParams();
            payload.append('token',token);
            payload.append('installation',id);

            // @ts-ignore
            const deviceValues = await this.idmApiClient.post('/api/installation/values',payload);

            if (deviceValues.status == 200){

                this.log.debug('Successfully received device data');
                this.setState('info.connection', true, true);

                const convertState = {
                    'icon_12': 'off',           // system & circuit
                    'icon_3': 'hot_water',      // system
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
                await this.setStateAsync('tempHygienic',this.doConvertToFloat(deviceValues.data['temp_hygienic']),true);
                await this.setStateAsync('tempWater',this.doConvertToFloat(deviceValues.data['temp_water']),true);

                // updating system values
                await this.setStateAsync('mode',convertMode[deviceValues.data['mode']],true);
                this.log.debug('Current system mode: '+deviceValues.data['mode']);
                await this.setStateAsync('state',convertState[deviceValues.data['state']],true);
                this.log.debug('Current system state: '+deviceValues.data['state']);
                await this.setStateAsync('sumHeat',this.doConvertToFloat(deviceValues.data['sum_heat']),true);
                await this.setStateAsync('tempOutside',this.doConvertToFloat(deviceValues.data['temp_outside']),true);
                await this.setStateAsync('errors',JSON.stringify(deviceValues.data['errors']),true);
                this.log.debug('Current errors: '+JSON.stringify(deviceValues.data['errors']));

                // updating circuit values
                await this.setStateAsync('circuits.0.mode',convertMode[deviceValues.data['circuits'][0]['mode']],true);
                this.log.debug('Current circuit mode: '+deviceValues.data['circuits'][0]['mode']);
                await this.setStateAsync('circuits.0.state',convertState[deviceValues.data['circuits'][0]['state']],true);
                this.log.debug('Current circuit state: '+deviceValues.data['circuits'][0]['state']);
                await this.setStateAsync('circuits.0.tempHeat',this.doConvertToFloat(deviceValues.data['temp_heat']),true);
                await this.setStateAsync('circuits.0.tempParamsNormal',this.doConvertToFloat(deviceValues.data['circuits'][0]['temp_params_normal']['value']),true);
                await this.setStateAsync('circuits.0.tempParamsEco',this.doConvertToFloat(deviceValues.data['circuits'][0]['temp_params_eco']['value']),true);
                await this.setStateAsync('circuits.0.tempForerun',this.doConvertToFloat(deviceValues.data['circuits'][0]['temp_forerun']),true);
                await this.setStateAsync('circuits.0.tempForerunActual',this.doConvertToFloat(deviceValues.data['circuits'][0]['temp_forerun_actual']),true);

            } else {
                this.log.warn('Server is returning: '+deviceValues.status);
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

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  * @param {string} id
    //  * @param {ioBroker.Object | null | undefined} obj
    //  */
    // onObjectChange(id, obj) {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    // }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
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