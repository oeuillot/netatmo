var Netatmo = require('./netatmo');
var commander = require('commander');
var util = require('util');

commander.version(require("./package.json").version);
commander.option("-u, --username <username>", "Username");
commander.option("-p, --password <password>", "Password");
commander.option("--client_id <client_id>", "Client Id");
commander.option("--client_secret <client_secret>", "Client secret");

commander.command('getDeviceList').description("Device list").action(
    function() {

      console.log("Request device list");

      var n = new Netatmo(commander);

      n.getDevicelist({
        app_type : 'app_station'
      }, function(error, modules, devices) {
        if (error) {
          console.error(error);
          return;
        }

        console.log("modules=" + util.inspect(modules, {
          depth : null
        }));
        console.log("devices=" + util.inspect(devices, {
          depth : null
        }));
      });

    });

commander.command('getStationsData').description("Device list").action(
    function() {

      console.log("Request device list");

      var n = new Netatmo(commander);

      n.getStationsData(function(error, list) {
        if (error) {
          console.error(error);
          return;
        }

        console.log("devices=" + util.inspect(list, {
          depth : null
        }));
      });

    });

commander.parse(process.argv);
