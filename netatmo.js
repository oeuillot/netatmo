var util = require('util');
var EventEmitter = require("events").EventEmitter;
var request = require('request');
var moment = require('moment');
var URL = require('url');
var debug = require('debug')('netatmo');
var semaphore = require('semaphore');

var BASE_URL = 'https://api.netatmo.net';

var netatmo = function(args) {
  args = args || {};
  this._args = args;

  this._authenticateLock = semaphore(1);

  if (!args.client_id) {
    throw new Error("Authenticate 'client_id' not set.");
  }

  if (!args.client_secret) {
    throw new Error("Authenticate 'client_secret' not set.");
  }

  if (!args.username) {
    throw new Error("Authenticate 'username' not set.");
  }

  if (!args.password) {
    throw new Error("Authenticate 'password' not set.");
  }
  args.scope = args.scope || 'read_station read_thermostat write_thermostat';

  EventEmitter.call(this);

  this.baseURL = args.baseURL || BASE_URL;
};

util.inherits(netatmo, EventEmitter);

netatmo.prototype.stop = function(callback) {
  if (this._stopped) {
    return callback();
  }

  this._stopped = true;
  if (this._refreshTimeoutId) {
    clearTimeout(this._refreshTimeoutId);
  }

  callback();
};

// http://dev.netatmo.com/doc/authentication
netatmo.prototype.getAccessToken = function(callback) {

  debug("Request access token ...");

  var sem = this._authenticateLock;

  var self = this;
  sem.take(function() {
    if (self.access_token) {
      sem.leave();

      return callback(null, self.access_token);
    }

    var args = self._args;

    var form = {
      client_id : args.client_id,
      client_secret : args.client_secret,
      username : args.username,
      password : args.password,
      scope : args.scope,
      grant_type : 'password',
    };

    debug("Form=", form);

    var url = URL.resolve(self.baseURL, '/oauth2/token');

    debug("URL=", url);

    request({
      url : url,
      method : "POST",
      form : form,
      json : true

    }, function(err, response, body) {
      debug("Request error=", err, "body=", body);

      if (err) {
        sem.leave();
        return callback(err);
      }
      if (response.statusCode != 200) {
        sem.leave();
        return callback(new Error("Unsupported status code " +
            response.statusCode + " " + response.status));
      }

      self.access_token = body.access_token;
      sem.leave();

      if (body.expires_in) {
        self._refreshTimeoutId = setTimeout(self.authenticate_refresh.bind(
            self, body.refresh_token), body.expires_in * 1000);
      }

      this.emit('authenticated');

      callback(null, self.access_token);
    });
  });
};

// http://dev.netatmo.com/doc/authentication
netatmo.prototype.authenticate_refresh = function(refresh_token) {
  debug("Refresh token ...");

  var args = this._args;

  var form = {
    grant_type : 'refresh_token',
    refresh_token : refresh_token,
    client_id : args.client_id,
    client_secret : args.client_secret,
  };

  var url = URL.resolve(this.baseURL, '/oauth2/token');

  var self = this;
  request({
    url : url,
    method : "POST",
    form : form,
    json : true

  }, function(err, response, body) {
    if (err) {
      console.error(err);
      self.emit("error", err);
      return;
    }
    if (response.statusCode != 200) {
      var ex = new Error("Unsupported status code " + response.statusCode +
          " " + response.status);

      console.error(ex)
      self.emit("error", ex);
      return;
    }

    self.access_token = body.access_token;

    if (body.expires_in && !self._stopped) {
      self._refreshTimeoutId = setTimeout(self.authenticate_refresh.bind(self,
          body.refresh_token), body.expires_in * 1000);
    }
  });
};

// http://dev.netatmo.com/doc/restapi/getuser
netatmo.prototype.getUser = function(callback) {
  var self = this;
  this.getAccessToken(function(error, access_token) {
    if (error) {
      return callback(error);
    }

    var url = URL.resolve(self.baseURL, '/api/getuser');

    var form = {
      access_token : access_token,
    };

    request({
      url : url,
      method : "POST",
      form : form,
      json : true

    }, function(err, response, body) {
      if (err) {
        return callback(err);
      }
      if (response.statusCode != 200) {
        return callback(new Error("Unsupported status code " +
            response.statusCode + " " + response.status));
      }

      return callback(null, body.body);
    });
  });
};

// http://dev.netatmo.com/doc/restapi/devicelist
netatmo.prototype.getDevicelist = function(options, callback) {

  if (arguments.length === 1 && typeof (options) === "function") {
    callback = options;
    options = null;
  }

  var self = this;
  this.getAccessToken(function(error, access_token) {
    if (error) {
      return callback(error);
    }

    var url = URL.resolve(self.baseURL, '/api/devicelist');

    var form = {
      access_token : access_token,
    };

    if (options && options.app_type) {
      form.app_type = options.app_type;
    }

    request({
      url : url,
      method : "POST",
      form : form,
      json : true

    }, function(err, response, body) {
      if (err) {
        return callback(err);
      }
      if (response.statusCode != 200) {
        return callback(new Error("Unsupported status code " +
            response.statusCode + " " + response.status));
      }

      return callback(null, body.body.modules, body.body.devices);
    });
  });
};

netatmo.prototype.getStationsData = function(options, callback) {

  if (arguments.length === 1 && typeof (options) === "function") {
    callback = options;
    options = null;
  }

  var self = this;
  this.getAccessToken(function(error, access_token) {
    if (error) {
      return callback(error);
    }

    var url = URL.resolve(self.baseURL, '/api/getstationsdata');

    var form = {
      access_token : access_token,
    };

    if (options && options.app_type) {
      form.app_type = options.app_type;
    }

    request({
      url : url,
      method : "POST",
      form : form,
      json : true

    }, function(err, response, body) {
      if (err) {
        return callback(err);
      }
      if (response.statusCode != 200) {
        return callback(new Error("Unsupported status code " +
            response.statusCode + " " + response.status));
      }

      return callback(null, body.body);
    });
  });
};

// http://dev.netatmo.com/doc/restapi/getmeasure
netatmo.prototype.getMeasure = function(options, callback) {

  if (!options) {
    return callback(new Error("getMeasure 'options' not set."));
  }

  if (!options.device_id) {
    return callback(new Error("getMeasure 'device_id' not set."));
  }

  if (!options.scale) {
    return callback(new Error("getMeasure 'scale' not set."));
  }

  if (!options.type) {
    return callback(new Error("getMeasure 'type' not set."));
  }

  if (util.isArray(options.type)) {
    options.type = options.type.join(',');
  }

  // Remove any spaces from the type list if there is any.
  options.type = options.type.replace(/\s/g, '').toLowerCase();

  var self = this;
  this.getAccessToken(function(error, access_token) {
    if (error) {
      return callback(error);
    }

    var url = URL.resolve(self.baseURL, '/api/getmeasure');

    var form = {
      access_token : access_token,
      device_id : options.device_id,
      scale : options.scale,
      type : options.type,
    };

    if (options) {

      if (options.module_id) {
        form.module_id = options.module_id;
      }

      if (options.date_begin) {
        if (options.date_begin <= 1E10) {
          options.date_begin *= 1E3;
        }

        form.date_begin = moment(options.date_begin).utc().unix();
      }

      if (options.date_end === 'last') {
        form.date_end = 'last';

      } else if (options.date_end) {
        if (options.date_end <= 1E10) {
          options.date_end *= 1000;
        }
        form.date_end = moment(options.date_end).utc().unix();
      }

      if (options.limit) {
        form.limit = parseInt(options.limit, 10);

        if (form.limit > 1024) {
          form.limit = 1024;
        }
      }

      if (options.optimize !== undefined) {
        form.optimize = !!options.optimize;
      }

      if (options.real_time !== undefined) {
        form.real_time = !!options.real_time;
      }
    }

    request({
      url : url,
      method : "POST",
      form : form,
      json : true

    }, function(err, response, body) {
      if (err) {
        return callback(err);
      }
      if (response.statusCode != 200) {
        return callback(new Error("Unsupported status code " +
            response.statusCode + " " + response.status));
      }

      var measure = body.body;

      return callback(null, measure);
    });
  });
};

// http://dev.netatmo.com/doc/restapi/getthermstate
netatmo.prototype.getThermstate = function(options, callback) {

  if (!options) {
    return callback(new Error("getThermstate 'options' not set."));
  }

  if (!options.device_id) {
    return callback(new Error("getThermstate 'device_id' not set."));
  }

  if (!options.module_id) {
    return callback(new Error("getThermstate 'module_id' not set."));
  }

  var self = this;
  this.getAccessToken(function(error, access_token) {
    if (error) {
      return callback(error);
    }

    var url = URL.resolve(self.baseURL, '/api/getthermstate');

    var form = {
      access_token : access_token,
      device_id : options.device_id,
      module_id : options.module_id,
    };

    request({
      url : url,
      method : "POST",
      form : form,
      json : true

    }, function(err, response, body) {
      if (err) {
        return callback(err);
      }
      if (response.statusCode != 200) {
        return callback(new Error("Unsupported status code " +
            response.statusCode + " " + response.status));
      }

      callback(null, body.body);
    });
  });
};

// http://dev.netatmo.com/doc/restapi/syncschedule
netatmo.prototype.setSyncSchedule = function(options, callback) {

  if (!options) {
    return callback(new Error("setSyncSchedule 'options' not set."));
  }

  if (!options.device_id) {
    return callback(new Error("setSyncSchedule 'device_id' not set."));
  }

  if (!options.module_id) {
    return callback(new Error("setSyncSchedule 'module_id' not set."));
  }

  if (!options.zones) {
    return callback(new Error("setSyncSchedule 'zones' not set."));
  }

  if (!options.timetable) {
    return callback(new Error("setSyncSchedule 'timetable' not set."));
  }

  var self = this;
  this.getAccessToken(function(error, access_token) {
    if (error) {
      return callback(error);
    }

    var url = URL.resolve(self.baseURL, '/api/syncschedule');

    var form = {
      access_token : access_token,
      device_id : options.device_id,
      module_id : options.module_id,
      zones : options.zones,
      timetable : options.timetable,
    };

    request({
      url : url,
      method : "POST",
      form : form,
      json : true

    }, function(err, response, body) {
      if (err) {
        return callback(err);
      }
      if (response.statusCode != 200) {
        return callback(new Error("Unsupported status code " +
            response.statusCode + " " + response.status));
      }

      callback(null, body.status);
    });
  });
};

// http://dev.netatmo.com/doc/restapi/setthermpoint
netatmo.prototype.setThermpoint = function(options, callback) {

  if (!options) {
    return callback(new Error("setThermpoint 'options' not set."));
  }

  if (!options.device_id) {
    return callback(new Error("setThermpoint 'device_id' not set."));
  }

  if (!options.module_id) {
    return callback(new Error("setThermpoint 'module_id' not set."));
  }

  if (!options.setpoint_mode) {
    return callback(new Error("setThermpoint 'setpoint_mode' not set."));
  }

  var self = this;
  this.getAccessToken(function(error, access_token) {
    if (error) {
      return callback(error);
    }

    var url = URL.resolve(self.baseURL, '/api/setthermpoint');

    var form = {
      access_token : access_token,
      device_id : options.device_id,
      module_id : options.module_id,
      setpoint_mode : options.setpoint_mode,
    };

    if (options) {
      if (options.setpoint_endtime) {
        form.setpoint_endtime = options.setpoint_endtime;
      }

      if (options.setpoint_temp) {
        form.setpoint_temp = options.setpoint_temp;
      }
    }

    request({
      url : url,
      method : "POST",
      form : form,
      json : true

    }, function(err, response, body) {
      if (err) {
        return callback(err);
      }
      if (response.statusCode != 200) {
        return callback(new Error("Unsupported status code " +
            response.statusCode + " " + response.status));
      }

      callback(null, body.status);
    });
  });
};

module.exports = netatmo;
