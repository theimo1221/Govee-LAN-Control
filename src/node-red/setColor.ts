import * as registry from "@node-red/registry";
import { Node, NodeAPISettingsWithData, NodeDef } from "node-red";
import Govee, { colorOptions, Device } from "../index";

var deviceIDregex = /([A-f0-9]{2}:){7}[A-z0-9]{2}/i;

//* https://regexr.com/38odc
var deviceIPregex = /\b(?:(?:2(?:[0-4][0-9]|5[0-5])|[0-1]?[0-9]?[0-9])\.){3}(?:(?:2([0-4][0-9]|5[0-5])|[0-1]?[0-9]?[0-9]))\b/ig;

module.exports = (RED: registry.NodeAPI<NodeAPISettingsWithData>): void =>
{
    function setColorNode (config: Record<string, any>)
    {
        RED.nodes.createNode(this, config as NodeDef);
        var node: Node = this;

        node.on("input", async (msg) =>
        {
            const govee = node.context().global.get("govee") as Govee;

            var device: Device;
            if (deviceIDregex.test(config.device))
            {
                device = govee.devicesArray.find((dev) => dev.deviceID == config.device);
            } else if (deviceIPregex.test(config.device))
            {
                device = govee.devicesMap.get(config.device);
            } else
            {
                RED.log.error("Unknown device ID or IP passed: " + config.device);
            }

            var newColor: colorOptions = msg.payload as colorOptions;
            if (config.color !== "#000000")
            {
                newColor = {
                    hex: config.color
                };
            }

            device.actions.setColor(newColor).then(async () =>
            {
                await device.updateValues();
                setTimeout(() => {
                    node.send(msg);
                }, 1);
            }).catch((res) =>
            {
                RED.log.error(res);
            });
        });
    }
    RED.nodes.registerType("Set Color", setColorNode);
};