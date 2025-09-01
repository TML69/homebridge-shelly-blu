import { Service, PlatformAccessory } from 'homebridge';
import { ShellyBluPlatform } from '../platform';
import BaseAccessory from './BaseAccessory';

export class SBMTAAccessory extends BaseAccessory {
  private motionService: Service;

  constructor(
    platform: ShellyBluPlatform,
    device: any,
    platformAccessory?: PlatformAccessory,
  ) {
    super(platform, device, platformAccessory);

    this.motionService = this.platformAccessory.getService(this.platform.Service.MotionSensor)
      || this.platformAccessory.addService(this.platform.Service.MotionSensor);

    this.motionService.setCharacteristic(this.platform.Characteristic.Name, device.code);
    this.motionService.setCharacteristic(this.platform.Characteristic.MotionDetected, false);
  }

  updateStatus(device: any) {
    const payload = device.payload || device.status || {};
    const motionDetected = !!payload["motion:0"]?.motion;

    this.platform.log.info(`[${device.code}] Motion detected: ${motionDetected}`);

    this.motionService.updateCharacteristic(
      this.platform.Characteristic.MotionDetected,
      motionDetected
    );
  }
}

export default SBMTAAccessory;