import { colorOptions, Device, fadeOptions, stateChangedOptions } from "..";
import { hex, hsl, rgb } from "color-convert";
import * as ct from 'color-temperature';

/**
 *
 * @param x Starting number
 * @param y Ending number
 * @param a percent (0-1)
 */
const lerp = (x: number, y: number, a: number) => x * (1 - a) + y * a;
/**
 *
 * @param a Starting number
 * @param b Ending number
 * @param amount percent (0-1)
 */
function lerpColor (a: string, b: string, amount: number)
{

    var ah = parseInt(a.replace(/#/g, ''), 16),
        ar = ah >> 16, ag = ah >> 8 & 0xff, ab = ah & 0xff,
        bh = parseInt(b.replace(/#/g, ''), 16),
        br = bh >> 16, bg = bh >> 8 & 0xff, bb = bh & 0xff,
        rr = ar + amount * (br - ar),
        rg = ag + amount * (bg - ag),
        rb = ab + amount * (bb - ab);

    return '#' + ((1 << 24) + (rr << 16) + (rg << 8) + rb | 0).toString(16).slice(1);
}

/**
 * Returns a bezier interpolated value, using the given ranges
 * @param {number} value  Value to be interpolated
 * @param {number} s1 Source range start
 * @param {number} s2  Source range end
 * @param {number} t1  Target range start
 * @param {number} t2  Target range end
 * @param {number} [slope]  Weight of the curve (0.5 = linear, 0.1 = weighted near target start, 0.9 = weighted near target end)
 * @returns {number} Interpolated value
 */
var interpolate = function (value: number, s1: number, s2: number, t1: any, t2: any, slope: number)
{
    //Default to linear interpolation
    slope = slope || 0.5;

    //If the value is out of the source range, floor to min/max target values
    if (value < Math.min(s1, s2))
    {
        return Math.min(s1, s2) === s1 ? t1 : t2;
    }

    if (value > Math.max(s1, s2))
    {
        return Math.max(s1, s2) === s1 ? t1 : t2;
    }

    //Reverse the value, to make it correspond to the target range (this is a side-effect of the bezier calculation)
    value = s2 - value;

    var C1 = { x: s1, y: t1 }; //Start of bezier curve
    var C3 = { x: s2, y: t2 }; //End of bezier curve
    var C2 = {              //Control point
        x: C3.x,
        y: C1.y + Math.abs(slope) * (C3.y - C1.y)
    };

    //Find out how far the value is on the curve
    var percent = value / (C3.x - C1.x);

    return C1.y * b1(percent) + C2.y * b2(percent) + C3.y * b3(percent);

    function b1 (t: number) { return t * t; }
    function b2 (t: number) { return 2 * t * (1 - t); }
    function b3 (t: number) { return (1 - t) * (1 - t); }
};

/**
 * @description
 * Set the color of a light.
 */
export function setColor (this: Device, options: colorOptions): Promise<void>
{
    var device = this;
    return new Promise((resolve, _reject) =>
    {
        var rgb = { r: 0, g: 0, b: 0 };
        var message: string;

        if (options.kelvin)
        {
            var kelvin = parseFloat(options.kelvin.toString().replace(/[^0-9]/g, ""));

            message = JSON.stringify(
                {
                    msg: {
                        cmd: "colorwc",
                        data: {
                            colorTemInKelvin: kelvin
                        }
                    }
                }
            );
        } else
        {
            if (options.hex !== undefined)
            {
                var newColor = hex.rgb(options.hex);
                rgb = {
                    r: newColor[0],
                    g: newColor[1],
                    b: newColor[2]
                };
            } else if (options.hsl !== undefined)
            {
                var newColor = hsl.rgb(options.hsl);
                rgb = {
                    r: newColor[0],
                    g: newColor[1],
                    b: newColor[2]
                };
            } else if (options.rgb !== undefined)
            {
                rgb = {
                    r: options.rgb[0],
                    g: options.rgb[1],
                    b: options.rgb[2]
                };
            }

            message = JSON.stringify(
                {
                    msg: {
                        cmd: "colorwc",
                        data: {
                            color: rgb
                        }
                    }
                }
            );
        }

        //! Commands have to be send twice te be caught by devstatus... annoying
        // device.socket?.send(message, 0, message.length, 4001, device.ip, () =>
        // {
            device.socket?.send(message, 0, message.length, 4003, device.ip, async () =>
            {
                if (rgb)
                {
                    device.state.color = rgb;
                    device.state.colorKelvin = ct.rgb2colorTemperature({ red: rgb.r, green: rgb.g, blue: rgb.b });
                } else if (kelvin)
                {
                    var rgbColor = ct.colorTemperature2rgb(kelvin);
                    device.state.color = { r: rgbColor.red, g: rgbColor.green, b: rgbColor.blue };
                    device.state.colorKelvin = kelvin;
                }
                device.emit("updatedStatus", device.state, ["color"])
                resolve();
                // await sleep(100)
                // updateValues(device, false)
            });
        // });
    });
}

export function setBrightness (this: Device, brightness: number | string): Promise<void>
{
    return new Promise((resolve, _reject) =>
    {
        var bright = Math.round(parseFloat(brightness.toString()) * 100) / 100;
        let message = JSON.stringify(
            {
                "msg": {
                    "cmd": "brightness",
                    "data": {
                        "value": bright,
                    }
                }
            }
        );
        //! Commands have to be send twice te be caught by devstatus... annoying
        // this.socket?.send(message, 0, message.length, 4001, this.ip, ()=>{
            this.socket?.send(message, 0, message.length, 4003, this.ip, async () =>
            {
                this.state.brightness = bright;
                resolve();
                await sleep(100)
                this.emit("updatedStatus", this.state, ["brightness"])
                // updateValues(this, false)
            });
        // });
    });
}

export function fade (this: Device, options: fadeOptions): Promise<void>
{
    return new Promise(async (resolve, reject) =>
    {
        var device = this;
        //? Get current value
        await updateValues(device);
        await sleep(100);

        var curHex = rgb.hex(device.state.color.r, device.state.color.g, device.state.color.b);
        var curKelvin = ct.rgb2colorTemperature({ red: device.state.color.r, green: device.state.color.g, blue: device.state.color.b });
        var curBrightness = device.state.isOn == 1 ? device.state.brightness : 1;
        var targetKelvin: number;
        const targetBright = options.brightness;

        if (options.color?.kelvin)
        {
            targetKelvin = parseFloat(options.color.kelvin.toString().replace(/[^0-9]/g, ""));
        }

        var changeColor = options.color?.hex !== undefined || options.color?.hsl !== undefined || options.color?.rgb !== undefined;

        var startTime = Date.now();

        var newColor = "";
        if (options.color?.hsl !== undefined)
            newColor = hsl.hex(options.color.hsl);
        else if (options.color?.rgb !== undefined)
            newColor = rgb.hex(options.color.rgb);
        else if (options.color?.hex !== undefined)
            newColor = options.color.hex.replace(/#/g, '');

        async function stepBrightness (percent: number, targetBrightness: number)
        {
            var newBright = lerp(curBrightness, targetBrightness, Math.max(Math.min(percent, 1), 0));
            return device.actions.setBrightness(newBright);
        }

        async function stepColor (percent: number, newColor: string)
        {
            var lerpedColor = lerpColor(curHex, newColor, Math.max(Math.min(percent, 1), 0));

            return device.actions.setColor({ hex: "#" + lerpedColor });
        }

        async function stepKelvin (percent: number, targetKelvin: number)
        {
            var lerpedKelvin = lerp(curKelvin, targetKelvin, Math.max(Math.min(percent, 1), 0));
            var kelvinRGB = ct.colorTemperature2rgb(lerpedKelvin);

            return device.actions.setColor({ rgb: [kelvinRGB.red, kelvinRGB.green, kelvinRGB.blue] });
        }

        // Start loop
        var running = true;

        var fadeEndTimeout = setTimeout(async () =>
        {
            running = false;
            this.removeListener("fadeCancel", fadeCancelHandler)
            if (changeColor)
            {
                setColor.call(device, {
                    hex: newColor
                });
            } else if (targetKelvin)
            {
                var kelvinRGB = ct.colorTemperature2rgb(targetKelvin);
                await device.actions.setColor({ rgb: [kelvinRGB.red, kelvinRGB.green, kelvinRGB.blue] });
            }
            if (targetBright !== undefined)
            {
                device.actions.setBrightness(targetBright);
            }

            await sleep(50);
            await device.updateValues();
            var updatedValues: stateChangedOptions = []
            if (curBrightness !== targetBright) {
                updatedValues.push("brightness")
            }
            if (changeColor) {
                updatedValues.push("color")
            }
            device.emit("updatedStatus", device.state, updatedValues)
            resolve();
        }, options.time - 100);

        // Respond to fade cancel
        function fadeCancelHandler(rejectPromise: boolean) {
            running = false
            clearTimeout(fadeEndTimeout);

            if (rejectPromise) {
                reject("Fade got cancelled")
            } else {
                resolve();
            }
        }
        this.once("fadeCancel", fadeCancelHandler)

        while (running)
        {
            var startLoopTime = Date.now();
            var percent = interpolate((Date.now() - startTime) / (options.time - 100), 0, 1, 0, 1, 0.5);
            // Color step
            if (changeColor)
            {
                stepColor(percent, newColor);
            }

            // Kelvin step
            if (options.color && options.color.kelvin !== undefined)
            {
                const targetKelvin =
                  typeof options.color.kelvin === "string" ? parseFloat(options.color.kelvin) : options.color.kelvin;
                if(!isNaN(targetKelvin)) stepKelvin(percent, targetKelvin);
            }

            // Brightness step
            if (options.brightness !== undefined)
            {
                stepBrightness(percent, options.brightness);
            }
            await sleep(30 - (Date.now() - startLoopTime));
        }
    });
}

function sleep (ms: number): Promise<void>
{
    return new Promise((resolve, _reject) =>
    {
        setTimeout(() =>
        {
            resolve();
        }, ms);
    });
}

export function updateValues (device?: Device, updateAll?: boolean)
{
    if(!device) {
        return Promise.reject("No device given");
    }
    return new Promise<void>((resolve, _reject) =>
    {
        let message = JSON.stringify(
            {
                "msg": {
                    "cmd": "devStatus",
                    "data": {}
                }
            }
        );
        if (!updateAll)
        {
            device.socket.send(message, 0, message.length, 4003, device.ip);
            resolve();
        } else
        {
            device.socket.send(message, 0, message.length, 4001, "239.255.255.250");
            resolve();
        }
    });
}
