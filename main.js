'use strict';

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const { createHash, Hash } = require('crypto');
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

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {

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
            timeout: 1000,
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

    async doLogin(){
        
        // Encode password for server
        let passwordHashed = "";
        try {
            const hash = createHash('sha1');
            hash.update(this.config.clientPassword);
            passwordHashed = hash.digest('hex');
        } catch (err) {
            this.log.error(err);
        }

        try {
            const payload = new URLSearchParams();
            payload.append('username',this.config.clientLogin);
            payload.append('password',passwordHashed);

            // @ts-ignore
            const installations = await this.idmApiClient.post('/api/user/login',payload);
            
            if (installations.status == 200){
                this.log.info('Successfully received session token');

                await this.setStateAsync('info.installationName',installations.data['installations'][0]['name'],true);

                // load device data, currently only first device supported
                this.getDeviceData(installations.data['token'],installations.data['installations'][0]['id'])
            } else {
                this.log.warn('Server is returning: '+installations.status)
            }
        } catch (err) {
            this.log.error(err);
        }

    }

    doConvertToFloat(value){
        return parseFloat(value); //parseFloat(value.replace('°C','').replace('kWh','').trim());
    }

    async getDeviceData(token, id){

        try {
            const payload = new URLSearchParams();
            payload.append('token',token);
            payload.append('installation',id);

            // @ts-ignore
            const deviceValues = await this.idmApiClient.post('/api/installation/values',payload);
            
            if (deviceValues.status == 200){
                this.log.info('Successfully received device data');
                this.setState('info.connection', true, true);

                // updating water values
                await this.setStateAsync('tempHygienic',this.doConvertToFloat(deviceValues.data['temp_hygienic']),true);
                await this.setStateAsync('tempWater',this.doConvertToFloat(deviceValues.data['temp_water']),true);

                // updating system values
                await this.setStateAsync('sumHeat',this.doConvertToFloat(deviceValues.data['sum_heat']),true);
                await this.setStateAsync('tempOutside',this.doConvertToFloat(deviceValues.data['temp_outside']),true);
                await this.setStateAsync('error',deviceValues.data['error'],true);

                // updating circuit values
                await this.setStateAsync('tempHeat',this.doConvertToFloat(deviceValues.data['temp_heat']),true);
                await this.setStateAsync('tempParamsNormal',this.doConvertToFloat(deviceValues.data['circuits'][0]['temp_params_normal']['value']),true);
                await this.setStateAsync('tempParamsEco',this.doConvertToFloat(deviceValues.data['circuits'][0]['temp_params_eco']['value']),true);
                await this.setStateAsync('tempForerun',this.doConvertToFloat(deviceValues.data['circuits'][0]['temp_forerun']),true);
                await this.setStateAsync('tempForerunActual',this.doConvertToFloat(deviceValues.data['circuits'][0]['temp_forerun_actual']),true);

                this.log.info('TW-Erw. unten: '+this.doConvertToFloat(deviceValues.data['temp_hygienic']));

                /*
print("---")
print("Warmwasser")
print("Heizung")
print("* Wärmespeichertemperatur:",mydata['temp_heat'])
print("* Betriebszustand Heizkreis:",circuitModeDictionary[mydata['circuits'][0]['state']])
print("* Betriebsmodus Heizkreis:",circuitModeDictionary[mydata['circuits'][0]['mode']])
print("System")
print("* Betriebszustand System:",modeDictionary[mydata['state']])
print("* Betriebsmodus System:",modeDictionary[mydata['mode']])
*/
            } else {
                this.log.warn('Server is returning: '+deviceValues.status)
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