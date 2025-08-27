import { Service, PlatformAccessory } from 'homebridge';
import BaseAccessory from './BaseAccessory';
import { ShellyBluPlatform } from '../platform';

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
    // For Shelly BLU Motion, motion status is at payload["motion:0"].motion
    const motionDetected = !!device.payload?.["motion:0"]?.motion;
    this.motionService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected);
  }
}

export default SBMTAAccessory;