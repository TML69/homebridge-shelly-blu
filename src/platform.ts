/* eslint-disable @typescript-eslint/no-explicit-any */
import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SBDWAccessory } from './accessories/SBDWAccessory';
import { SBMTAAccessory } from './accessories/SBMTAAccessory';
import ShellyCloudApi from './oauth';
import { client as WebSocketClient } from 'websocket';
import {
  is_shelly_generic_response,
  is_shelly_statusonchange,
} from './shellyTypes';
import BaseAccessory from './accessories/BaseAccessory';


/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ShellyBluPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly accessories: BaseAccessory[] = [];

  private _shellyApi: ShellyCloudApi | undefined;
  private _wsClient;
  private debugEnabled: boolean;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.debugEnabled = !!config.debug;
    this.log.info('Finished initializing platform:', this.config.name);

    if (this.config.email && this.config.password) {
      this._shellyApi = new ShellyCloudApi(log, config, api);
      this._wsClient = new WebSocketClient();

      this.api.on('didFinishLaunching', () => {
        log.debug('Executed didFinishLaunching callback');

        this.discoverDevices().then(async (devices: Array<any>) => {
          this.registerDevices(devices);
          await this.handleDevicesStateChanges(devices);
        });

      });
    } else {
      log.info('Plugin not configured. Skip');
    }

  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(platformAccessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', platformAccessory.displayName);

    const codePrefix = platformAccessory.context.code.split('-')[0];
    if (codePrefix === 'SBDW') {
      const accessory = new SBDWAccessory(this, {
        uniqueId: platformAccessory.context.uniqueId,
        code: platformAccessory.context.code,
      }, platformAccessory);
      this.accessories.push(accessory);
    } else if (codePrefix === 'SBMTA' || codePrefix === 'SBMO') {
      const accessory = new SBMTAAccessory(this, {
        uniqueId: platformAccessory.context.uniqueId,
        code: platformAccessory.context.code,
      }, platformAccessory);
      this.accessories.push(accessory);
    } 
  }

  async discoverDevices(): Promise<Array<any>> {
    const devices: Array<any> = [];
    if (this._shellyApi) {
      try {
        const payload = await this._shellyApi.call('/device/all_status');
        if (is_shelly_generic_response(payload) && payload.isok === true) {
          for(const deviceId in (payload.data as any).devices_status) {
            const devInfo = (payload.data as any).devices_status[deviceId]._dev_info;

            // Logging all devices for debugging
            this.debugLog(`Device found: ${devInfo.code} (${deviceId}))`);

            if(devInfo?.gen === 'GBLE') {
              devices.push({
                uniqueId: deviceId,
                code: devInfo.code,
                payload: (payload.data as any).devices_status[deviceId],
              });
              // Log BLU Motion sensors when discovered
              const codePrefix = devInfo.code.split('-')[0];
              if (codePrefix === 'SBMTA' || codePrefix === 'SBMO') {
                this.log.info(`Discovered BLU Motion sensor: ${devInfo.code} (${deviceId})`);
              }
            }
          }
        }
      } catch { /* empty */ }
    }

    return devices;
  }

  async handleDevicesStateChanges(devices) {
    if (this._shellyApi && devices.length > 0) {
      const wsClientEndpoint = await this._shellyApi.getWSEndpoint();
      this.log.debug(wsClientEndpoint);
      this._wsClient.on('connectFailed', (error) => {
        this.log.error('Connect Error: ' + error.toString());
        this.handleDevicesStateChanges(devices);
      });

      this._wsClient.on('connect', (connection) => {
        this.log.info('Connection established!');

        connection.on('error', (error) => {
          this.log.error('Connection error: ' + error.toString());
          this.handleDevicesStateChanges(devices);
        });

        connection.on('close', () => {
          this.log.info('Connection closed!');
        });

        connection.on('message', (message) => {
          const payload = JSON.parse(message.utf8Data);
          if(is_shelly_statusonchange(payload)) {
            this.log.debug('%j', payload);
            const uuid = this.api.hap.uuid.generate(payload.device.id as any);
            const existingAccessory = this.accessories.find(accessory => accessory.platformAccessory.UUID === uuid);
            if(existingAccessory) {
              const codePrefix = payload.device.code.split('-')[0];
              if (codePrefix === 'SBMTA' || codePrefix === 'SBMO') {
                this.log.info('BLU Motion payload: %j', payload.status); // <--- Add this line
                existingAccessory.updateStatus({
                  uniqueId: payload.device.id,
                  code: payload.device.code,
                  payload: payload.status,
                });
              }
            }
          }
        });
      });

      this._wsClient.connect(wsClientEndpoint);
    }
  }

  registerDevices(devices) {
    const accessories: Array<PlatformAccessory> = [];
    for (const device of devices) {
      const uuid = this.api.hap.uuid.generate(device.uniqueId);
      const existingAccessory = this.accessories.find(accessory => accessory.platformAccessory.UUID === uuid);
      this.log.debug('%j', device);

      const codePrefix = device.code.split('-')[0];

      if (codePrefix === 'SBDW') {
        const accessory = existingAccessory ?? new SBDWAccessory(this, device);
        if(!existingAccessory) {
          this.log.info('Adding new accessory:', device.code);
          accessories.push(accessory.platformAccessory);
        } else {
          this.log.info('Restore accessory from cache:', device.code);
          accessory.updateStatus(device);
        }
      } else if (codePrefix === 'SBMTA' || codePrefix === 'SBMO') {
        this.log.info(`Found BLU Motion sensor: ${device.code} (${device.uniqueId})`);
        const accessory = existingAccessory ?? new SBMTAAccessory(this, device);
        if(!existingAccessory) {
          this.log.info('Adding new accessory:', device.code);
          accessories.push(accessory.platformAccessory);
        } else {
          this.log.info('Restore accessory from cache:', device.code);
          accessory.updateStatus(device);
        }
      }
    }

    if(accessories.length > 0) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories);
    }
  }

  private debugLog(...args: any[]) {
    if (this.debugEnabled) {
      this.log.info('[DEBUG]', ...args);
    }
  }
}
