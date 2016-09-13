// third-party
const uuid = require('uuid');

// constants
const DEFAULT_PUBLISH_OPTIONS = {
  persistent: true,
  mandatory: false,
  contentType: 'application/json',
  contentEncoding: 'utf8',
};

function _array(obj) {
  return Array.prototype.slice.call(obj, 0);
}

/**
 * Publishses a 'info' level log
 * @param  {Object} sourceMessage
 */
exports.log = exports.info = function (sourceMessage) {

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
exports.warn = function (sourceMessage) {

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
exports.error = function (sourceMessage) {

  var type = 'log:error';
  var args = _array(arguments);

  var message = args.slice(1);

  this.publishUpdate(sourceMessage, message, {
    type: type
  });
};

/**
 * Acks the sourceMessage and publishes the result
 * @param  {Object} sourceMessage
 * @param  {*} result
 */
exports.respond = function (sourceMessage, result) {
  this.channel.ack(sourceMessage, false);

  this.publishUpdate(sourceMessage, result, {
    type: 'result'
  });
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
    throw new Error('invalid sourceMessage missing properties.replyTo');
  }

  var contentType;

  // make sure data is in buffer format
  if (typeof data === 'string') {
    data = new Buffer(data);
  } else if (data instanceof Object) {
    contentType = 'application/json';
    data = new Buffer(JSON.stringify(data));
  } else {
    throw new Error('unsupported data format', data);
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