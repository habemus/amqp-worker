// native
const EventEmitter = require('events').EventEmitter;
const util = require('util');

// third-party
const amqplib  = require('amqplib');
const Bluebird = require('bluebird');
const uuid     = require('uuid');

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

function _bufferize(data) {
  if (typeof data === 'string') {
    return new Buffer(data);
  } else if (data instanceof Object) {
    return new Buffer(JSON.stringify(data));
  } else {
    throw new Error('unsupported data format', data);
  }
}

function HWorker(options, fn) {
  EventEmitter.call(this);

  if (!options.rabbitMQURI) {
    throw new Error('rabbitMQURI is required');
  }

  fn = fn || this.fn;

  if (typeof fn !== 'function') {
    throw new TypeError('fn MUST be a Function');
  }

  this.rabbitMQURI = options.rabbitMQURI;
  this.fn = fn;

  var taskName = this.taskName || options.taskName;

  if (!taskName) {
    throw new Error('taskName is required');
  }

  this.taskExchangeName = taskName + '-exchange';
  this.taskQueueName    = taskName;

  this.appId            = options.appId || uuid.v4();

  // bind methods
  this.log   = this.log.bind(this);
  this.info  = this.info.bind(this);
  this.warn  = this.warn.bind(this);
  this.error = this.error.bind(this);
}

util.inherits(HWorker, EventEmitter);

/**
 * Connects to the rabbitMQURI specified upon instantiation
 * creates a channel and sets up required topology
 * for the worker.
 * 
 * @return {Bluebird -> HWorker}
 */
HWorker.prototype.connect = function () {

  var rabbitMQURI      = this.rabbitMQURI;
  var taskQueueName    = this.taskQueueName;
  var taskExchangeName = this.taskExchangeName;

  var _channel;

  return Bluebird.resolve(amqplib.connect(rabbitMQURI))
    .then((connection) => {
      return connection.createChannel();
    })
    .then((channel) => {
      _channel = channel;

      return Bluebird.all([
        /**
         * Queue at which task execution requests will be stored.
         */
        channel.assertQueue(taskQueueName),
        /**
         * Exchange for both queues.
         */
        channel.assertExchange(taskExchangeName, 'direct'),
        /**
         * Bind the taskQueue to the exchange using
         * the taskQueueName itself as the routingKey
         */
        channel.bindQueue(taskQueueName, taskExchangeName, taskQueueName),

      ]);
    })
    .then(() => {
      this.channel = _channel;

      this.channel.consume(this.taskQueueName, this.handleMessage, {
        /**
         * Require ack
         * @type {Boolean}
         */
        noAck: false,
        /**
         * Not exclusive, we want rabbitMQ to load balance
         * messages among available worker instances.
         * @type {Boolean}
         */
        exclusive: false,
      });

      return this;
    });
};

/**
 * Handles the incoming message from rabbitMQ.
 * Attempts to parse the message as JSON.
 *
 * If the content type defiend in the message.properties
 * is unsupported, nacks the message and ignores it.
 *
 * If there is an error parsing the message as JSON,
 * nacks it and ignores it.
 *
 * Once message parsing is done, executes the worker's fn.
 * 
 * @param  {Object} message
 * @return {Bluebird}
 */
HWorker.prototype.handleMessage = function (message) {

  if (!message) {
    // empty messages should be ignored
    return;
  } 

  var properties = message.properties;

  if (!properties.contentType === 'application/json') {
    this.error(message, new Error('unsupported content type'));

    // message format is not supported,
    // thus should be ignored.
    // Do not requeue

    // http://www.squaremobius.net/amqp.node/channel_api.html#channel_nack
    // #nack(message, [allUpTo, [requeue]])
    this.channel.nack(message, false, false);

    return;
  }

  try {
    var payload = JSON.parse(message.content.toString());
  } catch (e) {

    this.error(message, e);

    // error parsing message contents
    // should not requeue
    this.channel.nack(message, false, false);

  }

  /**
   * Execute the worker function
   */
  return this.fn(payload, this._makeLogger(), this)
    .then(this.respond.bind(this, message))
    .catch(this.handleError.bind(this, message));
};

/**
 * Acks the sourceMessage and publishes the result
 * @param  {Object} sourceMessage
 * @param  {*} result
 */
HWorker.prototype.respond = function (sourceMessage, result) {
  this.channel.ack(message, false);

  var message = {
    type: 'rpc-response',
    data: result,
  };

  this.publishResult(sourceMessage, message);
};

/**
 * Publishes a result for the given source message
 * @param  {Object} sourceMessage
 * @param  {*} data
 * @param  {Object} options      
 */
HWorker.prototype.publishResult = function (sourceMessage, data, options) {

  if (!sourceMessage || !sourceMessage.properties || !sourceMessage.properties.replyTo) {
    // ignore
    throw new Error('invalid sourceMessage missing properties.replyTo');
  }

  // make sure data is in buffer format
  data = _bufferize(data);

  // set default options for publishing
  options = Object.assign({}, DEFAULT_PUBLISH_OPTIONS, options);

  options.messageId = uuid.v4();
  options.timestamp = Date.now();
  options.appId     = this.appId;

  return this.channel.publish(
    this.taskExchangeName,
    sourceMessage.properties.replyTo,
    options
  );
};

/**
 * Handles an error.
 * By default nacks the sourceMessage and throws the error.
 * Should be implemented by actual workers.
 * 
 * @param  {Object} sourceMessage
 * @param  {Error} err
 */
HWorker.prototype.handleError = function (sourceMessage, err) {
  this.error(sourceMessage, err);

  this.channel.nack(sourceMessage, false, false);

  throw err;
};

Object.assign(HWorker.prototype, require('./logging'));

module.exports = HWorker;
