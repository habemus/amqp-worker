// third-party
const uuid = require('uuid');

// constants
const DEFAULT_PUBLISH_OPTIONS = {
  persistent: true,
  mandatory: false,
  contentType: 'application/json',
  contentEncoding: 'utf8',
};

const errors = require('../shared/errors');

/**
 * The default toJSON callback for errors
 * @param  {Error} err
 * @return {Object}
 */
function _defaultErrorToJSON(err) {
  return {
    name: err.name,
    message: err.message,
  };
}

function _array(obj) {
  return Array.prototype.slice.call(obj, 0);
}

/**
 * Publishses a 'info' level log
 * @param  {Object} sourceMessage
 */
exports.logInfo = function (sourceMessage) {

  var type = 'log:info';
  var args = _array(arguments);

  var message = args.slice(1);

  this.publishUpdate(sourceMessage, message, {
    type: type
  });
};

/**
 * Publishses a 'warning' level log
 * @param  {Object} sourceMessage
 */
exports.logWarning = function (sourceMessage) {

  var type = 'log:warning';
  var args = _array(arguments);

  var message = args.slice(1);

  this.publishUpdate(sourceMessage, message, {
    type: type
  });
};

/**
 * Publishses a 'error' level log
 * @param  {Object} sourceMessage
 */
exports.logError = function (sourceMessage) {

  var type = 'log:error';
  var args = _array(arguments);

  var message = args.slice(1);

  this.publishUpdate(sourceMessage, message, {
    type: type
  });
};

/**
 * Creates an object that exposes the four common logging methods of console.
 * 
 * @param  {Object} sourceMessage
 * @return {Object}
 */
exports._makeLogger = function (sourceMessage) {

  var logger = {};

  logger.log = logger.info = this.logInfo.bind(this, sourceMessage);
  logger.warn = this.logWarning.bind(this, sourceMessage);
  logger.error = this.logError.bind(this, sourceMessage);

  return logger;
}


/**
 * Acks the sourceMessage and publishes the result
 * @param  {Object} sourceMessage
 * @param  {*} result
 */
exports.respondSuccess = function (sourceMessage, result) {
  this.channel.ack(sourceMessage, false);

  this.publishUpdate(sourceMessage, result, {
    type: 'result:success'
  });
};

/**
 * Nacks the message and publishes an error result
 * 
 * @param  {Object} sourceMessage
 * @param  {Error} err
 */
exports.respondError = function (sourceMessage, err) {

  var errData;

  if (!err.toJSON) {
    errData = _defaultErrorToJSON(err);
  } else {
    errData = err.toJSON();
  }

  this.publishUpdate(sourceMessage, errData, {
    type: 'result:error'
  });

  this.channel.nack(sourceMessage, false, false);
};

/**
 * Publishes a result for the given source message
 * @param  {Object} sourceMessage
 * @param  {*} data
 * @param  {Object} options      
 */
exports.publishUpdate = function (sourceMessage, data, options) {

  if (!sourceMessage || !sourceMessage.properties || !sourceMessage.properties.replyTo) {
    // ignore
    throw new errors.InvalidOption('sourceMessage', 'malformed');
  }

  var contentType;

  // make sure data is in buffer format
  if (typeof data === 'string') {
    contentType = 'text/plain';
    data = new Buffer(data);
  } else if (data instanceof Object) {
    contentType = 'application/json';
    data = new Buffer(JSON.stringify(data));
  } else {
    contentType = 'text/plain';
    data = new Buffer(data.toString());
  }
  
  // set default options for publishing
  options = Object.assign({}, DEFAULT_PUBLISH_OPTIONS, options);

  options.messageId = uuid.v4();
  options.timestamp = Date.now();
  options.appId     = this.appId;
  options.correlationId = sourceMessage.properties.messageId;
  options.contentType = contentType;

  return this.channel.publish(
    this.taskExchangeName,
    sourceMessage.properties.replyTo,
    data,
    options
  );
};